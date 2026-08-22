#![no_std]

use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, String};
use stellar_macros::default_impl;
use stellar_tokens::fungible::{burnable::FungibleBurnable, Base, FungibleToken};

/// Per-bucket share token. Admin is the bucket-vault contract, which is the
/// only caller of `mint`; burns go through the SEP-41 burn/burn_from entry
/// points (vault uses burn_from with a user allowance).
#[contract]
pub struct ShareToken;

const ADMIN: soroban_sdk::Symbol = symbol_short!("ADMIN");
// ponytail: OZ leaves instance TTL to the implementor; keeper calls bump()
// on a schedule instead of wiring bumps into every entry point.
const INSTANCE_TTL_THRESHOLD: u32 = 17280; // ~1 day
const INSTANCE_TTL_BUMP: u32 = 86400; // ~5 days

#[contractimpl]
impl ShareToken {
    pub fn __constructor(e: &Env, admin: Address, name: String, symbol: String) {
        // 8 decimals so share units line up with DIA's 8-decimal USD prices.
        Base::set_metadata(e, 8, name, symbol);
        e.storage().instance().set(&ADMIN, &admin);
    }

    pub fn mint(e: &Env, to: Address, amount: i128) {
        Self::admin(e).require_auth();
        Base::mint(e, &to, amount);
    }

    pub fn admin(e: &Env) -> Address {
        e.storage().instance().get(&ADMIN).unwrap()
    }

    pub fn bump(e: &Env) {
        e.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
    }
}

#[default_impl]
#[contractimpl]
impl FungibleToken for ShareToken {
    type ContractType = Base;
}

#[default_impl]
#[contractimpl]
impl FungibleBurnable for ShareToken {}

#[cfg(test)]
mod test;
