#![cfg(test)]

use crate::{
    dia::OracleValue,
    {Allocation, BucketVault, BucketVaultClient, VaultError},
};
use soroban_sdk::{
    contract, contractimpl,
    token::{Client as TokenClient, StellarAssetClient},
    testutils::{Address as _, Ledger},
    vec, Address, Env, String, Vec,
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

/// Pulls `path[0]` from the recipient (`to`, which the vault sets to itself),
/// sends 1:1 raw units of `path[1]`. Must be pre-funded with inventory.
#[contract]
pub struct MockRouter;

#[contractimpl]
impl MockRouter {
    pub fn swap_exact_tokens_for_tokens(
        e: &Env,
        amount_in: i128,
        amount_out_min: i128,
        path: Vec<Address>,
        to: Address,
        _deadline: u64,
    ) -> Vec<i128> {
        assert!(amount_out_min <= amount_in, "mock router: min out exceeded");
        let sell = path.get(0).unwrap();
        let buy = path.get(1).unwrap();
        let me = e.current_contract_address();
        TokenClient::new(e, &sell).transfer_from(&me.clone(), &to.clone(), &me, &amount_in);
        TokenClient::new(e, &buy).transfer(&me, &to, &amount_in);
        vec![&e, amount_in, amount_in]
    }
}

fn key(e: &Env, s: &str) -> String {
    String::from_str(e, s)
}

const TS: u64 = 1_000_000;

struct Setup {
    env: Env,
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
    let router = env.register(MockRouter, ());

    let vault_addr = env.register(BucketVault, ());
    let vault = BucketVaultClient::new(&env, &vault_addr);
    vault.initialize(
        &admin,
        &usdc,
        &key(&env, "USDC/USD"),
        &oracle,
        &router,
        &300,
        &500,
    );

    // Fund mock router with stock inventory for buy legs.
    StellarAssetClient::new(&env, &aapl).mint(&router, &(10_000_000_000_000));
    StellarAssetClient::new(&env, &nvda).mint(&router, &(10_000_000_000_000));

    let oc = MockOracleClient::new(&env, &oracle);
    oc.set(&key(&env, "USDC/USD"), &100_000_000u128, &TS); // $1
    oc.set(&key(&env, "AAPL/USD"), &200_000_000u128, &TS); // $2
    oc.set(&key(&env, "NVDA/USD"), &100_000_000u128, &TS); // $1

    Setup { env, vault_addr, usdc, aapl, nvda }
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

    // Keeper rebalance toward 60/40. Expected buys priced off DIA:
    // AAPL $48 -> 480e6 raw usdc in; NVDA $32 -> 320e6 raw usdc in.
    // Mock router returns 1:1 units; min_outs set just under that.
    s.vault().rebalance(
        &id,
        &(TS + 3600),
        &50,
        &vec![&s.env, 479_999_999i128, 319_999_999i128],
    );

    let h = s.vault().holdings(&id);
    assert_eq!(h.get(s.usdc.clone()).unwrap_or(0), 0);
    assert_eq!(h.get(s.aapl.clone()).unwrap_or(0), 480_000_000i128);
    assert_eq!(h.get(s.nvda.clone()).unwrap_or(0), 320_000_000i128);

    // NAV re-priced through DIA after swaps (mock over-delivers vs price).
    assert_eq!(s.vault().portfolio_value(&id), 12_800_000_000i128);
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
        &vec![&s.env, 119_999_999i128, 79_999_999i128],
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
