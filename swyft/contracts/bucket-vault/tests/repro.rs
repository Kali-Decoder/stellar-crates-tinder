//! Repro: create_bucket traps on testnet when deploying share_token via
//! deploy_v2 from the real wasm hash. Mirrors on-chain setup using the built
//! wasm artifacts instead of in-process mocks.

use soroban_sdk::{
    testutils::Address as _,
    vec, Address, Bytes, Env, String, Vec,
};

use bucket_vault::{BucketVaultClient, Allocation};

#[test]
fn create_bucket_with_real_share_wasm() {
    let e = Env::default();
    e.mock_all_auths();

    let share_wasm =
        Bytes::from_slice(&e, include_bytes!("../../target/wasm32v1-none/release/share_token.wasm"));
    let share_hash = e.deployer().upload_contract_wasm(share_wasm);

    let vault_wasm =
        Bytes::from_slice(&e, include_bytes!("../../target/wasm32v1-none/release/bucket_vault.wasm"));
    let vault_id = e.register_contract_wasm(None, vault_wasm);

    let admin = Address::generate(&e);
    let usdc = Address::generate(&e);
    let oracle = Address::generate(&e);

    let client = BucketVaultClient::new(&e, &vault_id);
    client.initialize(
        &admin,
        &usdc,
        &String::from_str(&e, "USDC/USD"),
        &oracle,
        &share_hash,
        &259200,
        &200,
    );

    let allocs: Vec<Allocation> = vec![
        &e,
        Allocation {
            asset: Address::generate(&e),
            dia_key: String::from_str(&e, "AAPL/USD"),
            target_bps: 10_000,
        },
    ];
    let id = client.create_bucket(&String::from_str(&e, "Test Bucket"), &allocs);
    assert_eq!(id, 0);
}
