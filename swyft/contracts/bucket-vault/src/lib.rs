#![no_std]

mod dia;
#[cfg(test)]
mod test;

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, panic_with_error,
    symbol_short, Address, BytesN, Env, Map, String, Symbol, Vec,
};
use soroban_sdk::token::Client as TokenClient;

/// Everything is 8-decimal USD internally to match DIA prices.
const PRICE_SCALE: u128 = 100_000_000;
/// $1 minimum trade so rebalancing doesn't spam dust swaps.
const MIN_TRADE_USD: u128 = 1_000_000_00;
/// Hard slippage ceiling regardless of what the keeper asks for.
const MAX_SLIPPAGE_BPS: u32 = 1_000;
const MAX_ALLOCATIONS: u32 = 20;
const INSTANCE_TTL_THRESHOLD: u32 = 17280;
const INSTANCE_TTL_BUMP: u32 = 86400;

#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub usdc: Address,
    /// DIA key of the deposit asset, e.g. "USDC/USD".
    pub usdc_key: String,
    pub dia_oracle: Address,
    /// Wasm hash of the deployed share-token contract; the vault deploys one
    /// instance per user basket.
    pub share_token_wasm: BytesN<32>,
    pub staleness_secs: u64,
    pub drift_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Allocation {
    pub asset: Address,
    /// DIA feed key for this asset, e.g. "AAPL/USD".
    pub dia_key: String,
    pub target_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Bucket {
    pub id: u32,
    pub name: String,
    pub allocations: Vec<Allocation>,
    pub share_token: Address,
}

/// Internal USDC<->asset pool owned by the vault. Reserves are tokens the
/// vault already custodies; swaps are pure reserve accounting, no transfers.
/// ponytail: 0-fee constant product; admin seeds liquidity, so prices track
/// whatever ratio admin seeds (re-seed to follow DIA). Add a fee if third
/// parties ever trade against these pools.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Pool {
    pub usdc_res: i128,
    pub asset_res: i128,
}

#[contracttype]
pub enum DataKey {
    Config,
    NextBucketId,
    Bucket(u32),
    /// asset -> raw balance; includes idle USDC.
    Balances(u32),
    /// asset -> vault-owned swap reserves.
    Pool(Address),
}

#[contracterror]
pub enum VaultError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    BadAllocation = 4,
    NoSuchBucket = 5,
    InsufficientShares = 6,
    StalePrice = 7,
    NoPrice = 8,
    SlippageTooHigh = 9,
    DeadlinePassed = 10,
    BadMinOuts = 11,
    Overflow = 12,
}

/// Minimal client for the per-bucket share token (see ../share-token).
/// ponytail: hand-rolled client instead of depending on the OZ crate here;
/// only these two privileged entry points are used.
#[contractclient(name = "ShareTokenClient")]
pub trait ShareToken {
    fn total_supply(e: &Env) -> i128;
    fn mint(e: &Env, to: Address, amount: i128);
    fn burn_from(e: &Env, spender: Address, from: Address, amount: i128);
}

#[contract]
pub struct BucketVault;

#[contractimpl]
impl BucketVault {
    pub fn initialize(
        e: &Env,
        admin: Address,
        usdc: Address,
        usdc_key: String,
        dia_oracle: Address,
        share_token_wasm: BytesN<32>,
        staleness_secs: u64,
        drift_bps: u32,
    ) {
        if e.storage().instance().has(&DataKey::Config) {
            panic_with_error!(e, VaultError::AlreadyInitialized);
        }
        admin.require_auth();
        // ponytail: initialize-once, no upgrade path; redeploy to change params.
        let cfg = Config {
            admin,
            usdc,
            usdc_key,
            dia_oracle,
            share_token_wasm,
            staleness_secs,
            drift_bps,
        };
        e.storage().instance().set(&DataKey::NextBucketId, &0u32);
        e.storage().instance().set(&DataKey::Config, &cfg);
        e.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
    }

    pub fn set_admin(e: &Env, new_admin: Address) {
        let mut cfg = Self::config(e);
        cfg.admin.require_auth();
        new_admin.require_auth();
        cfg.admin = new_admin;
        e.storage().instance().set(&DataKey::Config, &cfg);
    }

    /// Anyone may create a basket (the swipe UX builds one per user). The
    /// vault deploys the share token itself, so no pre-registration step.
    /// Returns the bucket id; share token address is on get_bucket(id).
    pub fn create_bucket(e: &Env, name: String, allocations: Vec<Allocation>) -> u32 {
        let cfg = Self::config(e);

        if name.is_empty() || name.len() > 64 || allocations.is_empty() || allocations.len() > MAX_ALLOCATIONS {
            panic_with_error!(e, VaultError::BadAllocation);
        }
        let mut sum_bps = 0u32;
        for (i, a) in allocations.iter().enumerate() {
            if a.target_bps == 0 || a.target_bps > 10_000 || a.asset == cfg.usdc {
                panic_with_error!(e, VaultError::BadAllocation);
            }
            for prev in allocations.slice(0..i as u32) {
                if prev.asset == a.asset {
                    panic_with_error!(e, VaultError::BadAllocation);
                }
            }
            sum_bps = sum_bps
                .checked_add(a.target_bps)
                .unwrap_or_else(|| panic_with_error!(e, VaultError::BadAllocation));
        }
        // Exact 100% so targets are unambiguous for rebalance + UI claim math.
        if sum_bps != 10_000 {
            panic_with_error!(e, VaultError::BadAllocation);
        }

		let id = e.storage().instance().get::<_, u32>(&DataKey::NextBucketId).unwrap_or(0);
		e.storage().instance().set(&DataKey::NextBucketId, &(id + 1));

		// Fixed symbol; name carries the identity.
		let symbol = String::from_str(e, "SWYFT");
		// Deterministic salt from bucket id — PRNG salts differ between simulation
		// and execution, so deploy address leaves the footprint and create_bucket traps.
		let mut salt_bytes = [0u8; 32];
		salt_bytes[28..32].copy_from_slice(&id.to_be_bytes());
		let salt = BytesN::from_array(e, &salt_bytes);
		let share_token = e
			.deployer()
			.with_current_contract(salt)
			.deploy_v2(
				cfg.share_token_wasm,
				(e.current_contract_address(), name.clone(), symbol),
			);

        let bucket = Bucket { id, name, allocations, share_token };
        e.storage().persistent().set(&DataKey::Bucket(id), &bucket);
        e.storage().persistent().extend_ttl(
            &DataKey::Bucket(id),
            INSTANCE_TTL_THRESHOLD,
            INSTANCE_TTL_BUMP,
        );
        Self::save_balances(e, id, &Map::new(e));
        e.events().publish((symbol_short!("created"), id), bucket.name);
        id
    }

    /// Pull USDC (caller must have approved the vault) and mint shares.
    /// First depositor gets 1 share per $1; afterwards shares pro-rate at NAV.
    pub fn deposit(e: &Env, bucket_id: u32, from: Address, amount: i128) -> i128 {
        if amount <= 0 {
            panic_with_error!(e, VaultError::Overflow);
        }
        from.require_auth();
        let cfg = Self::config(e);
        let bucket = Self::bucket(e, bucket_id);

        // Compute shares against pre-deposit NAV before moving funds so a
        // dust/zero mint cannot strand USDC in the vault.
        let supply = ShareTokenClient::new(e, &bucket.share_token).total_supply();
        let dep_price = dia::fresh_price(e, &cfg.dia_oracle, &cfg.usdc_key, cfg.staleness_secs);
        let dep_usd = Self::usd_value(e, &cfg.usdc, amount, dep_price);
        let shares = if supply == 0 {
            dep_usd
        } else {
            let pre_nav = Self::nav(e, &cfg, bucket_id).1;
            if pre_nav <= 0 {
                panic_with_error!(e, VaultError::Overflow);
            }
            ((dep_usd as u128) * (supply as u128) / (pre_nav as u128)) as i128
        };
        if shares <= 0 {
            panic_with_error!(e, VaultError::Overflow);
        }

        TokenClient::new(e, &cfg.usdc).transfer_from(
            &e.current_contract_address(),
            &from,
            &e.current_contract_address(),
            &amount,
        );

        let mut b = Self::balances(e, bucket_id);
        b.set(cfg.usdc.clone(), b.get(cfg.usdc.clone()).unwrap_or(0) + amount);
        Self::save_balances(e, bucket_id, &b);

        ShareTokenClient::new(e, &bucket.share_token)
            .mint(&from, &shares);

        e.events().publish((symbol_short!("deposit"), bucket_id), (from, amount, shares));
        shares
    }

    /// Burn `shares` (caller must have approved the vault on the share token),
    /// send the pro-rata slice of every holding including idle USDC.
    pub fn withdraw(e: &Env, bucket_id: u32, user: Address, shares: i128) {
        if shares <= 0 {
            panic_with_error!(e, VaultError::InsufficientShares);
        }
        user.require_auth();
        let cfg = Self::config(e);
        let bucket = Self::bucket(e, bucket_id);
        let token_c = TokenClient::new(e, &bucket.share_token);

        let supply = ShareTokenClient::new(e, &bucket.share_token).total_supply();
        if supply < shares || token_c.balance(&user) < shares {
            panic_with_error!(e, VaultError::InsufficientShares);
        }

        let (mut b, _total) = Self::nav(e, &cfg, bucket_id);
        let self_addr = e.current_contract_address();
        let out_map = Self::pro_rata_slice(e, &b, shares, supply);

        // Effects before interactions: burn, update ledger, then pay out.
        ShareTokenClient::new(e, &bucket.share_token)
            .burn_from(&self_addr.clone(), &user, &shares);

        for k in out_map.keys() {
            let out = out_map.get(k.clone()).unwrap();
            let held = b.get(k.clone()).unwrap_or(0);
            b.set(k.clone(), held - out);
        }
        Self::save_balances(e, bucket_id, &b);

        for k in out_map.keys() {
            TokenClient::new(e, &k).transfer(&self_addr, &user, &out_map.get(k).unwrap());
        }

        e.events().publish((symbol_short!("withdraw"), bucket_id), (user, shares));
    }

    /// Keeper-callable (permissionless: min-outs bound what any caller can do).
    /// Trades every drifted allocation back toward target: sells overweight
    /// assets into USDC, buys underweight ones. min_outs[i] is the accepted
    /// output floor for allocation i (direction decided on-chain).
    pub fn rebalance(e: &Env, bucket_id: u32, deadline: u64, slippage_bps: u32, min_outs: Vec<i128>) {
        let cfg = Self::config(e);
        if e.ledger().timestamp() > deadline {
            panic_with_error!(e, VaultError::DeadlinePassed);
        }
        if slippage_bps > MAX_SLIPPAGE_BPS {
            panic_with_error!(e, VaultError::SlippageTooHigh);
        }
        let bucket = Self::bucket(e, bucket_id);
        if min_outs.len() != bucket.allocations.len() {
            panic_with_error!(e, VaultError::BadMinOuts);
        }

        let (mut b, total) = Self::nav(e, &cfg, bucket_id);
        if total <= 0 {
            return;
        }
        let drift_floor = (total as u128) * (cfg.drift_bps as u128) / 10_000;
        let usdc_dec = TokenClient::new(e, &cfg.usdc).decimals();

        for (i, a) in bucket.allocations.iter().enumerate() {
            let dec = TokenClient::new(e, &a.asset).decimals();
            let price = dia::fresh_price(e, &cfg.dia_oracle, &a.dia_key, cfg.staleness_secs);
            let held = b.get(a.asset.clone()).unwrap_or(0);
            let cur = Self::usd_value(e, &a.asset, held, price);
            let target = (total as u128) * (a.target_bps as u128) / 10_000;
            let diff_abs = target.abs_diff(cur as u128);

            if diff_abs <= drift_floor || diff_abs < MIN_TRADE_USD {
                continue;
            }
            let min_out = min_outs.get(i as u32).unwrap_or(0);
            if min_out <= 0 {
                continue;
            }

            if cur as u128 > target {
                // Sell overweight down to target.
                let sell_amt = Self::amount_for_usd(diff_abs, price, dec).min(held);
                if sell_amt <= 0 {
                    continue;
                }
                let out = Self::swap_via_pool(e, &a.asset, false, sell_amt, min_out);
                b.set(a.asset.clone(), held - sell_amt);
                b.set(cfg.usdc.clone(), b.get(cfg.usdc.clone()).unwrap_or(0) + out);
            } else {
                // Buy underweight up to target using idle USDC.
                let idle = b.get(cfg.usdc.clone()).unwrap_or(0);
                let buy_usdc_amt =
                    (((diff_abs * 10u128.pow(usdc_dec as u32)) / PRICE_SCALE) as i128).min(idle);
                if buy_usdc_amt <= 0 {
                    continue;
                }
                let out = Self::swap_via_pool(e, &a.asset, true, buy_usdc_amt, min_out);
                b.set(cfg.usdc.clone(), idle - buy_usdc_amt);
                b.set(a.asset.clone(), held + out);
            }

            e.events().publish(
                (Symbol::new(e, "rebalance"), bucket_id),
                (a.asset.clone(), cur, target),
            );
        }
        Self::save_balances(e, bucket_id, &b);
    }

    // ---------- views ----------

    pub fn get_bucket(e: &Env, bucket_id: u32) -> Bucket {
        Self::bucket(e, bucket_id)
    }

    /// Admin funds the vault's swap reserves for `asset` (admin must have
    /// approved the vault on both tokens). Pool price = reserve ratio.
    pub fn seed_pool(e: &Env, asset: Address, usdc_amount: i128, asset_amount: i128) {
        let cfg = Self::config(e);
        cfg.admin.require_auth();
        if usdc_amount <= 0 || asset_amount <= 0 {
            panic_with_error!(e, VaultError::Overflow);
        }
        let self_addr = e.current_contract_address();
        TokenClient::new(e, &cfg.usdc).transfer_from(&self_addr, &cfg.admin, &self_addr, &usdc_amount);
        TokenClient::new(e, &asset).transfer_from(&self_addr, &cfg.admin, &self_addr, &asset_amount);

        let mut p = Self::pool_get(e, &asset);
        p.usdc_res += usdc_amount;
        p.asset_res += asset_amount;
        e.storage().persistent().set(&DataKey::Pool(asset.clone()), &p);
        e.events().publish((symbol_short!("seeded"), asset), (usdc_amount, asset_amount));
    }

    pub fn get_pool(e: &Env, asset: Address) -> Pool {
        Self::pool_get(e, &asset)
    }

    pub fn bucket_count(e: &Env) -> u32 {
        e.storage().instance().get::<_, u32>(&DataKey::NextBucketId).unwrap_or(0)
    }

    pub fn holdings(e: &Env, bucket_id: u32) -> Map<Address, i128> {
        Self::balances(e, bucket_id)
    }

    /// Portfolio value in 8-decimal USD; fails if any feed is stale/missing.
    pub fn portfolio_value(e: &Env, bucket_id: u32) -> i128 {
        Self::nav(e, &Self::config(e), bucket_id).1
    }

    /// Pro-rata token amounts a share balance would receive on withdraw.
    /// Does not move funds — UI uses this to show implied AAPL/NVDA/USDC claim.
    pub fn preview_withdraw(e: &Env, bucket_id: u32, shares: i128) -> Map<Address, i128> {
        if shares <= 0 {
            panic_with_error!(e, VaultError::InsufficientShares);
        }
        let bucket = Self::bucket(e, bucket_id);
        let supply = ShareTokenClient::new(e, &bucket.share_token).total_supply();
        if supply == 0 || shares > supply {
            panic_with_error!(e, VaultError::InsufficientShares);
        }
        let b = Self::balances(e, bucket_id);
        Self::pro_rata_slice(e, &b, shares, supply)
    }

    // ---------- internals ----------

    fn pro_rata_slice(e: &Env, b: &Map<Address, i128>, shares: i128, supply: i128) -> Map<Address, i128> {
        let mut out_map = Map::new(e);
        for k in b.keys() {
            let held = b.get(k.clone()).unwrap_or(0);
            let out = ((held as u128) * (shares as u128) / (supply as u128)) as i128;
            if out > 0 {
                out_map.set(k, out);
            }
        }
        out_map
    }

    fn pool_get(e: &Env, asset: &Address) -> Pool {
        e.storage()
            .persistent()
            .get(&DataKey::Pool(asset.clone()))
            .unwrap_or(Pool { usdc_res: 0, asset_res: 0 })
    }

    /// Constant-product swap against vault-owned reserves. No token movement:
    /// reserves and bucket balances are both internal ledger entries.
    fn swap_via_pool(e: &Env, asset: &Address, usdc_to_asset: bool, amount_in: i128, min_out: i128) -> i128 {
        if amount_in <= 0 {
            panic_with_error!(e, VaultError::Overflow);
        }
        let mut p = Self::pool_get(e, asset);
        let (res_in, res_out) = if usdc_to_asset {
            (p.usdc_res, p.asset_res)
        } else {
            (p.asset_res, p.usdc_res)
        };
        if res_in <= 0 || res_out <= 0 {
            panic_with_error!(e, VaultError::NoPrice);
        }
        let out = ((amount_in as u128) * (res_out as u128) / ((res_in as u128) + (amount_in as u128)))
            as i128;
        if out < min_out {
            panic_with_error!(e, VaultError::SlippageTooHigh);
        }
        if usdc_to_asset {
            p.usdc_res += amount_in;
            p.asset_res -= out;
        } else {
            p.asset_res += amount_in;
            p.usdc_res -= out;
        }
        e.storage().persistent().set(&DataKey::Pool(asset.clone()), &p);
        out
    }

    fn config(e: &Env) -> Config {
        e.storage()
            .instance()
            .get::<_, Config>(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(e, VaultError::NotInitialized))
    }

    fn bucket(e: &Env, bucket_id: u32) -> Bucket {
        e.storage()
            .persistent()
            .get(&DataKey::Bucket(bucket_id))
            .unwrap_or_else(|| panic_with_error!(e, VaultError::NoSuchBucket))
    }

    fn balances(e: &Env, bucket_id: u32) -> Map<Address, i128> {
        e.storage()
            .persistent()
            .get(&DataKey::Balances(bucket_id))
            .unwrap_or(Map::new(e))
    }

    fn save_balances(e: &Env, bucket_id: u32, b: &Map<Address, i128>) {
        e.storage().persistent().set(&DataKey::Balances(bucket_id), b);
        e.storage()
            .persistent()
            .extend_ttl(&DataKey::Balances(bucket_id), INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
    }

    /// (balances, total USD value 8dec). Prices every holding via DIA.
    fn nav(e: &Env, cfg: &Config, bucket_id: u32) -> (Map<Address, i128>, i128) {
        let b = Self::balances(e, bucket_id);
        let mut total = 0i128;
        let idle = b.get(cfg.usdc.clone()).unwrap_or(0);
        if idle != 0 {
            let p = dia::fresh_price(e, &cfg.dia_oracle, &cfg.usdc_key, cfg.staleness_secs);
            total += Self::usd_value(e, &cfg.usdc, idle, p);
        }
        let bucket = Self::bucket(e, bucket_id);
        for a in bucket.allocations.iter() {
            let held = b.get(a.asset.clone()).unwrap_or(0);
            if held == 0 {
                continue;
            }
            let p = dia::fresh_price(e, &cfg.dia_oracle, &a.dia_key, cfg.staleness_secs);
            total += Self::usd_value(e, &a.asset, held, p);
        }
        (b, total)
    }

    fn usd_value(e: &Env, asset: &Address, amount: i128, price: u128) -> i128 {
        let dec = TokenClient::new(e, asset).decimals();
        if dec > 18 {
            panic_with_error!(e, VaultError::Overflow);
        }
        let v = (amount as u128).checked_mul(price).expect("usd overflow") / 10u128.pow(dec);
        if v > i128::MAX as u128 {
            panic_with_error!(e, VaultError::Overflow);
        }
        v as i128
    }

    fn amount_for_usd(usd: u128, price: u128, dec: u32) -> i128 {
        (usd.checked_mul(10u128.pow(dec)).expect("amt overflow") / price.max(1)) as i128
    }
}

