//! DIA oracle cross-contract reader.
//!
//! DIA's Soroban price oracle (https://www.diadata.org/docs/guides/chain-specific-guide/stellar)
//! stores feeds as `read_oracle_value(key) -> OracleValue` where the key is
//! e.g. "AAPL/USD", price has 8 decimals and timestamp is unix seconds.
//! Testnet deployment: CAEDPEZDRCEJCF73ASC5JGNKCIJDV2QJQSW6DJ6B74MYALBNKCJ5IFP4

use crate::VaultError;
use soroban_sdk::{contractclient, contracttype, panic_with_error, Address, Env, String};

/// Mirrors diadata-org/soroban-oracles `storage_types::OracleValue`.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct OracleValue(pub u128, pub u128); // (price 8dec USD, updated_at unix secs)

#[contractclient(name = "DiaClient")]
pub trait DiaOracle {
    fn read_oracle_value(e: &Env, key: String) -> OracleValue;
}

/// Returns the fresh 8-decimal price for `key`, fails closed otherwise:
/// missing or stale prices must stop valuation/rebalance/deposit.
pub fn fresh_price(e: &Env, oracle: &Address, key: &String, staleness_secs: u64) -> u128 {
    let v = DiaClient::new(e, oracle).read_oracle_value(key);
    let now = e.ledger().timestamp();
    if v.0 == 0 {
        panic_with_error!(e, VaultError::NoPrice);
    }
    // ponytail: fixed ±60s clock-skew window instead of per-feed session logic.
    if (v.1 as u64) + staleness_secs < now || (v.1 as u64) > now + 60 {
        panic_with_error!(e, VaultError::StalePrice);
    }
    v.0
}
