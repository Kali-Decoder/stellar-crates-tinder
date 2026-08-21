use soroban_sdk::{testutils::Address as _, vec, Address, Env, IntoVal, String, Vec};

use crate::{DiaOracle, DiaOracleClient, OracleValue};

#[test]
fn set_then_read_roundtrip() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let id = e.register(DiaOracle, (&admin,));
    let client = DiaOracleClient::new(&e, &id);

    let aapl: String = "AAPL/USD".into_val(&e);
    let usdc: String = "USDC/USD".into_val(&e);
    let keys: Vec<String> = vec![&e, aapl.clone(), usdc.clone()];
    let values = vec![
        &e,
        OracleValue(309_42_000000, 1_700_000_100),
        OracleValue(1_00_000000, 1_700_000_100),
    ];
    client.set_prices(&keys, &values);

    assert_eq!(
        client.read_oracle_value(&aapl),
        OracleValue(309_42_000000, 1_700_000_100)
    );
    // missing feed reads as zero -> vault fails closed on price==0
    let nope: String = "ZZZZ/USD".into_val(&e);
    assert_eq!(client.read_oracle_value(&nope), OracleValue(0, 0));
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn non_admin_cannot_write() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let id = e.register(DiaOracle, (&admin,));
    let client = DiaOracleClient::new(&e, &id);
    let k: Vec<String> = vec![&e, "AAPL/USD".into_val(&e)];
    let v = vec![&e, OracleValue(1, 1)];
    client.set_prices(&k, &v);
}
