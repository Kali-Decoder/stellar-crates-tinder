//! Soroswap-style router CPI for rebalance swaps.
//!
//! Matches Soroswap Router v1 `swap_exact_tokens_for_tokens`. The router
//! address is admin-set config, so pointing at a different AMM/aggregator is
//! a config change, not a code change.

use soroban_sdk::{contractclient, Address, Env, Vec};

#[contractclient(name = "RouterClient")]
pub trait SoroswapRouter {
    fn swap_exact_tokens_for_tokens(
        e: &Env,
        amount_in: i128,
        amount_out_min: i128,
        path: Vec<Address>,
        to: Address,
        deadline: u64,
    ) -> Vec<i128>;
}

/// Exact-in swap returning the received output amount.
pub fn swap(
    e: &Env,
    router: &Address,
    amount_in: i128,
    amount_out_min: i128,
    path: Vec<Address>,
    to: &Address,
    deadline: u64,
) -> i128 {
    let amounts = RouterClient::new(e, router).swap_exact_tokens_for_tokens(
        &amount_in,
        &amount_out_min,
        &path,
        to,
        &deadline,
    );
    amounts.last().unwrap_or(0)
}
