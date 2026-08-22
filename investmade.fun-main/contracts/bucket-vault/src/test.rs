#![cfg(test)]

// ponytail: raw wasm bytes instead of contractimport! (OZ event specs trip its
// parser). Run `stellar contract build` once before `cargo test`.
const SHARE_TOKEN_WASM: &[u8] =
    include_bytes!("../../target/wasm32v1-none/release/share_token.wasm");

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
    oracle: Address,
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
    let share_wasm_hash = env.deployer().upload_contract_wasm(SHARE_TOKEN_WASM);
    vault.initialize(
        &admin,
        &usdc,
        &key(&env, "USDC/USD"),
        &oracle,
        &share_wasm_hash,
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

    Setup { env, admin, vault_addr, oracle, usdc, aapl, nvda }
}

fn make_bucket(s: &Setup) -> u32 {
    let allocs = vec![
        &s.env,
        Allocation { asset: s.aapl.clone(), dia_key: key(&s.env, "AAPL/USD"), target_bps: 6_000 },
        Allocation { asset: s.nvda.clone(), dia_key: key(&s.env, "NVDA/USD"), target_bps: 4_000 },
    ];
    s.vault()
        .create_bucket(&String::from_str(&s.env, "Tech Ten"), &allocs)
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

#[test]
fn create_bucket_rejects_bad_allocations() {
    let s = setup();

    // Empty allocations
    let empty = vec![&s.env];
    let res = s
        .vault()
        .try_create_bucket(&String::from_str(&s.env, "Empty"), &empty);
    match res {
        Err(Ok(err)) => assert_eq!(err, VaultError::BadAllocation.into()),
        other => panic!("expected BadAllocation empty, got ok={}", other.is_ok()),
    }

    // Weights sum over 100%
    let over = vec![
        &s.env,
        Allocation {
            asset: s.aapl.clone(),
            dia_key: key(&s.env, "AAPL/USD"),
            target_bps: 6_000,
        },
        Allocation {
            asset: s.nvda.clone(),
            dia_key: key(&s.env, "NVDA/USD"),
            target_bps: 5_000,
        },
    ];
    let res = s
        .vault()
        .try_create_bucket(&String::from_str(&s.env, "Over"), &over);
    match res {
        Err(Ok(err)) => assert_eq!(err, VaultError::BadAllocation.into()),
        other => panic!("expected BadAllocation over, got ok={}", other.is_ok()),
    }

    // Duplicate asset
    let dup = vec![
        &s.env,
        Allocation {
            asset: s.aapl.clone(),
            dia_key: key(&s.env, "AAPL/USD"),
            target_bps: 5_000,
        },
        Allocation {
            asset: s.aapl.clone(),
            dia_key: key(&s.env, "AAPL/USD"),
            target_bps: 5_000,
        },
    ];
    let res = s
        .vault()
        .try_create_bucket(&String::from_str(&s.env, "Dup"), &dup);
    match res {
        Err(Ok(err)) => assert_eq!(err, VaultError::BadAllocation.into()),
        other => panic!("expected BadAllocation dup, got ok={}", other.is_ok()),
    }

    // Under-weight (must be exactly 100%)
    let under = vec![
        &s.env,
        Allocation {
            asset: s.aapl.clone(),
            dia_key: key(&s.env, "AAPL/USD"),
            target_bps: 4_000,
        },
        Allocation {
            asset: s.nvda.clone(),
            dia_key: key(&s.env, "NVDA/USD"),
            target_bps: 4_000,
        },
    ];
    let res = s
        .vault()
        .try_create_bucket(&String::from_str(&s.env, "Under"), &under);
    match res {
        Err(Ok(err)) => assert_eq!(err, VaultError::BadAllocation.into()),
        other => panic!("expected BadAllocation under, got ok={}", other.is_ok()),
    }

    // USDC cannot be an allocation asset
    let usdc_leg = vec![
        &s.env,
        Allocation {
            asset: s.usdc.clone(),
            dia_key: key(&s.env, "USDC/USD"),
            target_bps: 10_000,
        },
    ];
    let res = s
        .vault()
        .try_create_bucket(&String::from_str(&s.env, "Usdc"), &usdc_leg);
    match res {
        Err(Ok(err)) => assert_eq!(err, VaultError::BadAllocation.into()),
        other => panic!("expected BadAllocation usdc, got ok={}", other.is_ok()),
    }
}

#[test]
fn deposit_rejects_zero_amount() {
    let s = setup();
    let id = make_bucket(&s);
    let alice = Address::generate(&s.env);
    let res = s.vault().try_deposit(&id, &alice, &0i128);
    match res {
        Err(Ok(err)) => assert_eq!(err, VaultError::Overflow.into()),
        other => panic!("expected Overflow, got ok={}", other.is_ok()),
    }
}

#[test]
fn double_initialize_fails() {
    let s = setup();
    let res = s.vault().try_initialize(
        &s.admin,
        &s.usdc,
        &key(&s.env, "USDC/USD"),
        &Address::generate(&s.env),
        &s.env.deployer().upload_contract_wasm(SHARE_TOKEN_WASM),
        &300,
        &500,
    );
    match res {
        Err(Ok(err)) => assert_eq!(err, VaultError::AlreadyInitialized.into()),
        other => panic!("expected AlreadyInitialized, got ok={}", other.is_ok()),
    }
}

#[test]
fn missing_bucket_fails() {
    let s = setup();
    let res = s.vault().try_get_bucket(&99u32);
    match res {
        Err(Ok(err)) => assert_eq!(err, VaultError::NoSuchBucket.into()),
        other => panic!("expected NoSuchBucket, got ok={}", other.is_ok()),
    }
}

#[test]
fn preview_withdraw_shows_pro_rata_claims() {
    let s = setup();
    let id = make_bucket(&s);
    let alice = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.usdc).mint(&alice, &100_000_000i128); // 10 USDC
    TokenClient::new(&s.env, &s.usdc).approve(&alice, &s.vault_addr, &100_000_000i128, &1000);
    let shares = s.vault().deposit(&id, &alice, &100_000_000i128);

    // Pre-rebalance: claim is idle USDC only.
    let pre = s.vault().preview_withdraw(&id, &shares);
    assert_eq!(pre.get(s.usdc.clone()).unwrap_or(0), 100_000_000i128);
    assert_eq!(pre.get(s.aapl.clone()).unwrap_or(0), 0);
    assert_eq!(pre.get(s.nvda.clone()).unwrap_or(0), 0);

    s.vault().rebalance(
        &id,
        &(TS + 3600),
        &50,
        &vec![&s.env, 20_000_000i128, 30_000_000i128],
    );

    let post = s.vault().preview_withdraw(&id, &shares);
    assert!(post.get(s.aapl.clone()).unwrap_or(0) > 0, "aapl claim");
    assert!(post.get(s.nvda.clone()).unwrap_or(0) > 0, "nvda claim");
}

#[test]
fn partial_withdraw_splits_fairly_between_depositors() {
    let s = setup();
    let id = make_bucket(&s);

    let alice = Address::generate(&s.env);
    let bob = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.usdc).mint(&alice, &600_000_000i128); // 60
    StellarAssetClient::new(&s.env, &s.usdc).mint(&bob, &400_000_000i128); // 40
    TokenClient::new(&s.env, &s.usdc).approve(&alice, &s.vault_addr, &600_000_000i128, &1000);
    TokenClient::new(&s.env, &s.usdc).approve(&bob, &s.vault_addr, &400_000_000i128, &1000);

    let alice_shares = s.vault().deposit(&id, &alice, &600_000_000i128);
    let bob_shares = s.vault().deposit(&id, &bob, &400_000_000i128);
    assert_eq!(alice_shares, 6_000_000_000i128);
    assert_eq!(bob_shares, 4_000_000_000i128);

    // Alice withdraws half her shares while still USDC-only.
    let half = alice_shares / 2;
    let share_token = s.vault().get_bucket(&id).share_token;
    TokenClient::new(&s.env, &share_token).approve(&alice, &s.vault_addr, &half, &1000);
    let usdc_before = TokenClient::new(&s.env, &s.usdc).balance(&alice);
    s.vault().withdraw(&id, &alice, &half);
    let usdc_after = TokenClient::new(&s.env, &s.usdc).balance(&alice);
    assert_eq!(usdc_after - usdc_before, 300_000_000i128); // half of 60

    let remaining = s.vault().holdings(&id).get(s.usdc.clone()).unwrap_or(0);
    assert_eq!(remaining, 700_000_000i128); // 40 bob + 30 alice left
}

#[test]
fn rebalance_rejects_past_deadline() {
    let s = setup();
    let id = make_bucket(&s);
    let alice = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.usdc).mint(&alice, &100_000_000i128);
    TokenClient::new(&s.env, &s.usdc).approve(&alice, &s.vault_addr, &100_000_000i128, &1000);
    s.vault().deposit(&id, &alice, &100_000_000i128);

    let res = s.vault().try_rebalance(
        &id,
        &(TS - 1),
        &50,
        &vec![&s.env, 1i128, 1i128],
    );
    match res {
        Err(Ok(err)) => assert_eq!(err, VaultError::DeadlinePassed.into()),
        other => panic!("expected DeadlinePassed, got ok={}", other.is_ok()),
    }
}

#[test]
fn rebalance_rejects_bad_min_outs_len() {
    let s = setup();
    let id = make_bucket(&s);
    let res = s.vault().try_rebalance(
        &id,
        &(TS + 3600),
        &50,
        &vec![&s.env, 1i128], // need 2
    );
    match res {
        Err(Ok(err)) => assert_eq!(err, VaultError::BadMinOuts.into()),
        other => panic!("expected BadMinOuts, got ok={}", other.is_ok()),
    }
}

#[test]
fn missing_usdc_price_fails_deposit() {
    let s = setup();
    let id = make_bucket(&s);
    // Wipe USDC feed -> (0,0) => NoPrice
    MockOracleClient::new(&s.env, &s.oracle).set(&key(&s.env, "USDC/USD"), &0u128, &TS);

    let alice = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.usdc).mint(&alice, &100_000_000i128);
    TokenClient::new(&s.env, &s.usdc).approve(&alice, &s.vault_addr, &100_000_000i128, &1000);
    let res = s.vault().try_deposit(&id, &alice, &100_000_000i128);
    match res {
        Err(Ok(err)) => assert_eq!(err, VaultError::NoPrice.into()),
        other => panic!("expected NoPrice, got ok={}", other.is_ok()),
    }
}

#[test]
fn second_depositor_mints_pro_rata_at_nav() {
    let s = setup();
    let id = make_bucket(&s);
    let alice = Address::generate(&s.env);
    let bob = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.usdc).mint(&alice, &100_000_000i128);
    StellarAssetClient::new(&s.env, &s.usdc).mint(&bob, &100_000_000i128);
    TokenClient::new(&s.env, &s.usdc).approve(&alice, &s.vault_addr, &100_000_000i128, &1000);
    TokenClient::new(&s.env, &s.usdc).approve(&bob, &s.vault_addr, &100_000_000i128, &1000);

    assert_eq!(s.vault().deposit(&id, &alice, &100_000_000i128), 1_000_000_000i128);
    // Same NAV → same $ deposit → same shares
    assert_eq!(s.vault().deposit(&id, &bob, &100_000_000i128), 1_000_000_000i128);
    assert_eq!(s.vault().portfolio_value(&id), 2_000_000_000i128);
}
