#![cfg(test)]

use crate::{
    dia::OracleValue,
    {Allocation, BucketVault, BucketVaultClient, VaultError},
};
use soroban_sdk::{
    contract, contractimpl,
    token::{Client as TokenClient, StellarAssetClient},
    testutils::{Address as _, Ledger},
    vec, Address, Env, String,
};

// ---- mocks ----

/// DIA-shaped oracle returning configured prices.
#[contract]
pub struct MockOracle;

#[contractimpl]
impl MockOracle {
    pub fn set(e: &Env, key: String, price: u128, ts: u64) {
        e.storage().persistent().set(&key, &OracleValue(price, ts as u128));
    }

    pub fn read_oracle_value(e: &Env, key: String) -> OracleValue {
        e.storage()
            .persistent()
            .get(&key)
            .unwrap_or(OracleValue(0, 0))
    }
}

fn key(e: &Env, s: &str) -> String {
    String::from_str(e, s)
}

const TS: u64 = 1_000_000;

struct Setup {
    env: Env,
    admin: Address,
    vault_addr: Address,
    usdc: Address,
    aapl: Address,
    nvda: Address,
}

impl Setup {
    fn vault(&self) -> BucketVaultClient<'_> {
        BucketVaultClient::new(&self.env, &self.vault_addr)
    }
}

fn setup() -> Setup {
    let env = Env::default();
    // Nested CPIs (vault -> share token / usdc) need non-root auth mocking.
    env.mock_all_auths_allowing_non_root_auth();
    env.ledger().with_mut(|li| li.timestamp = TS);

    let admin = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let aapl = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let nvda = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let oracle = env.register(MockOracle, ());

    let vault_addr = env.register(BucketVault, ());
    let vault = BucketVaultClient::new(&env, &vault_addr);
    vault.initialize(
        &admin,
        &usdc,
        &key(&env, "USDC/USD"),
        &oracle,
        &300,
        &500,
    );

    // Seed vault pools at DIA prices: AAPL $2 (200k USDC / 100k AAPL),
    // NVDA $1 (100k / 100k). Deep reserves keep rebalance slippage tiny.
    let oc = MockOracleClient::new(&env, &oracle);
    oc.set(&key(&env, "USDC/USD"), &100_000_000u128, &TS); // $1
    oc.set(&key(&env, "AAPL/USD"), &200_000_000u128, &TS); // $2
    oc.set(&key(&env, "NVDA/USD"), &100_000_000u128, &TS); // $1

    StellarAssetClient::new(&env, &usdc).mint(&admin, &3_000_000_000_000i128);
    StellarAssetClient::new(&env, &aapl).mint(&admin, &1_000_000_000_000i128);
    StellarAssetClient::new(&env, &nvda).mint(&admin, &1_000_000_000_000i128);
    TokenClient::new(&env, &usdc).approve(&admin, &vault_addr, &3_000_000_000_000i128, &1000);
    TokenClient::new(&env, &aapl).approve(&admin, &vault_addr, &1_000_000_000_000i128, &1000);
    TokenClient::new(&env, &nvda).approve(&admin, &vault_addr, &1_000_000_000_000i128, &1000);
    vault.seed_pool(&aapl, &2_000_000_000_000i128, &1_000_000_000_000i128);
    vault.seed_pool(&nvda, &1_000_000_000_000i128, &1_000_000_000_000i128);

    Setup { env, admin, vault_addr, usdc, aapl, nvda }
}

fn make_bucket(s: &Setup) -> u32 {
    let share_token = s.env.register(
        share_token::ShareToken,
        share_token::ShareTokenArgs::__constructor(
            &s.vault_addr,
            &String::from_str(&s.env, "Tech Ten"),
            &String::from_str(&s.env, "TECH10"),
        ),
    );
    let allocs = vec![
        &s.env,
        Allocation { asset: s.aapl.clone(), dia_key: key(&s.env, "AAPL/USD"), target_bps: 6_000 },
        Allocation { asset: s.nvda.clone(), dia_key: key(&s.env, "NVDA/USD"), target_bps: 4_000 },
    ];
    s.vault()
        .create_bucket(&String::from_str(&s.env, "Tech Ten"), &allocs, &share_token)
}

#[test]
fn deposit_shares_nav_rebalance() {
    let s = setup();
    let id = make_bucket(&s);
    assert_eq!(s.vault().bucket_count(), 1);

    // Alice deposits 50 USDC (@7dec SAC) -> shares = $50 @8dec.
    let alice = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.usdc).mint(&alice, &500_000_000i128);
    TokenClient::new(&s.env, &s.usdc).approve(&alice, &s.vault_addr, &500_000_000i128, &1000);
    assert_eq!(
        s.vault().deposit(&id, &alice, &500_000_000i128),
        5_000_000_000i128
    );

    // Bob deposits 30 USDC at same NAV -> $30 of shares.
    let bob = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.usdc).mint(&bob, &300_000_000i128);
    TokenClient::new(&s.env, &s.usdc).approve(&bob, &s.vault_addr, &300_000_000i128, &1000);
    assert_eq!(s.vault().deposit(&id, &bob, &300_000_000i128), 3_000_000_000i128);

    assert_eq!(s.vault().portfolio_value(&id), 8_000_000_000i128);

    // Keeper rebalance toward 60/40. Buys priced off DIA:
    // AAPL $48 -> 480e6 raw usdc in; NVDA $32 -> 320e6 raw usdc in.
    // Pool math (200k/100k reserves) delivers ~239.9m / ~319.9m raw.
    s.vault().rebalance(
        &id,
        &(TS + 3600),
        &50,
        &vec![&s.env, 230_000_000i128, 300_000_000i128],
    );

    let h = s.vault().holdings(&id);
    assert_eq!(h.get(s.usdc.clone()).unwrap_or(0), 0);
    let aapl_out = h.get(s.aapl.clone()).unwrap_or(0);
    let nvda_out = h.get(s.nvda.clone()).unwrap_or(0);
    assert!(aapl_out > 235_000_000 && aapl_out < 245_000_000, "aapl {aapl_out}");
    assert!(nvda_out > 315_000_000 && nvda_out < 325_000_000, "nvda {nvda_out}");

    // NAV re-priced through DIA after swaps; small spread loss vs $80 pre-trade.
    let nav = s.vault().portfolio_value(&id);
    assert!(nav > 7_900_000_000 && nav < 8_000_000_000, "nav {nav}");
}

#[test]
fn withdraw_pays_pro_rata_slice_and_burns() {
    let s = setup();
    let id = make_bucket(&s);

    let alice = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.usdc).mint(&alice, &200_000_000i128); // 20 USDC
    TokenClient::new(&s.env, &s.usdc).approve(&alice, &s.vault_addr, &200_000_000i128, &1000);
    let shares = s.vault().deposit(&id, &alice, &200_000_000i128);
    assert_eq!(shares, 2_000_000_000i128);

    s.vault().rebalance(
        &id,
        &(TS + 3600),
        &50,
        &vec![&s.env, 50_000_000i128, 60_000_000i128],
    );

    let share_token = s.vault().get_bucket(&id).share_token;
    TokenClient::new(&s.env, &share_token).approve(&alice, &s.vault_addr, &shares, &1000);

    s.vault().withdraw(&id, &alice, &shares);

    let st = crate::ShareTokenClient::new(&s.env, &share_token);
    assert_eq!(st.total_supply(), 0);
    assert!(TokenClient::new(&s.env, &s.aapl).balance(&alice) > 0);
    assert!(TokenClient::new(&s.env, &s.nvda).balance(&alice) > 0);
}

#[test]
fn stale_price_fails_closed() {
    let s = setup();
    let id = make_bucket(&s);
    let alice = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.usdc).mint(&alice, &100_000_000i128);
    TokenClient::new(&s.env, &s.usdc).approve(&alice, &s.vault_addr, &100_000_000i128, &1000);
    s.vault().deposit(&id, &alice, &100_000_000i128);

    s.env.ledger().with_mut(|li| li.timestamp = TS + 60_000);

    let res = s.vault().try_portfolio_value(&id);
    match res {
        Err(Ok(err)) => assert_eq!(err, VaultError::StalePrice.into()),
        other => panic!("expected StalePrice, got ok={}", other.is_ok()),
    }

    let bob = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.usdc).mint(&bob, &100_000_000i128);
    TokenClient::new(&s.env, &s.usdc).approve(&bob, &s.vault_addr, &100_000_000i128, &1000);
    let res = s.vault().try_deposit(&id, &bob, &100_000_000i128);
    match res {
        Err(Ok(err)) => assert_eq!(err, VaultError::StalePrice.into()),
        other => panic!("expected StalePrice on deposit, got ok={}", other.is_ok()),
    }
}
