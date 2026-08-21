#![no_std]

//! Self-hosted RWA price oracle for testnet, wire-compatible with DIA's
//! Soroban oracle interface (`read_oracle_value(key) -> OracleValue`, price
//! 8-decimal USD, timestamp unix secs). Fed off-chain by scripts/price-updater.mjs
//! mirroring https://api.diadata.org/v1/rwa/* REST feeds.
//!
//! The public DIA testnet deployment only carries BTC/USDC/DIA and its
//! contract instance expired; this replaces it so bucket-vault works unchanged.

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec};

/// Mirrors diadata-org/soroban-oracles `storage_types::OracleValue` — must stay
/// byte-compatible with bucket-vault/src/dia.rs.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct OracleValue(pub u128, pub u128); // (price 8dec USD, updated_at unix secs)

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Price(String),
}

#[contract]
pub struct DiaOracle;

// ponytail: extend-on-write keeps feeds alive; the real DIA testnet oracle died
// from TTL expiry. Bumped to ~30d per update, plenty vs a 5-min poll cycle.
const PRICE_TTL_THRESHOLD: u32 = 172_800; // ~10 days
const PRICE_TTL_BUMP: u32 = 518_400; // ~30 days

#[contractimpl]
impl DiaOracle {
    pub fn __constructor(e: &Env, admin: Address) {
        e.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Batch upsert. Only the updater admin.
    pub fn set_prices(e: &Env, keys: Vec<String>, values: Vec<OracleValue>) {
        let admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        assert_eq!(keys.len(), values.len(), "keys/values length mismatch");
        for i in 0..keys.len() {
            let k = keys.get(i).unwrap();
            e.storage().persistent().set(&DataKey::Price(k.clone()), &values.get(i).unwrap());
            e.storage()
                .persistent()
                .extend_ttl(&DataKey::Price(k), PRICE_TTL_THRESHOLD, PRICE_TTL_BUMP);
        }
    }

    /// Same fail-open-to-zero semantics as DIA's oracle: missing feed reads as
    /// OracleValue(0, 0); the vault treats price==0 as NoPrice and fails closed.
    pub fn read_oracle_value(e: &Env, key: String) -> OracleValue {
        e.storage()
            .persistent()
            .get(&DataKey::Price(key))
            .unwrap_or(OracleValue(0u128, 0u128))
    }
}

#[cfg(test)]
mod test;
