#![cfg(test)]

use crate::{ShareToken, ShareTokenClient};
use soroban_sdk::{
    testutils::Address as _,
    token::TokenClient,
    Address, Env, String,
};

fn deploy(e: &Env, admin: &Address, name: &str, symbol: &str) -> Address {
    e.register(
        ShareToken,
        (
            admin.clone(),
            String::from_str(e, name),
            String::from_str(e, symbol),
        ),
    )
}

#[test]
fn admin_can_mint_and_metadata_is_set() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let user = Address::generate(&e);
    let id = deploy(&e, &admin, "Tech Ten", "SWYFT");
    let client = ShareTokenClient::new(&e, &id);
    let token = TokenClient::new(&e, &id);

    assert_eq!(client.admin(), admin);
    assert_eq!(token.decimals(), 8);
    assert_eq!(token.name(), String::from_str(&e, "Tech Ten"));
    assert_eq!(token.symbol(), String::from_str(&e, "SWYFT"));

    client.mint(&user, &1_000_000_000i128);
    assert_eq!(token.balance(&user), 1_000_000_000i128);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn non_admin_cannot_mint() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let stranger = Address::generate(&e);
    let id = deploy(&e, &admin, "Basket", "SWYFT");
    ShareTokenClient::new(&e, &id).mint(&stranger, &100i128);
}

#[test]
fn burn_reduces_balance() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let user = Address::generate(&e);
    let id = deploy(&e, &admin, "Basket", "SWYFT");
    let client = ShareTokenClient::new(&e, &id);
    let token = TokenClient::new(&e, &id);

    client.mint(&user, &500i128);
    token.burn(&user, &200i128);
    assert_eq!(token.balance(&user), 300i128);
}

#[test]
fn transfer_moves_balance_between_users() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    let id = deploy(&e, &admin, "Basket", "SWYFT");
    let client = ShareTokenClient::new(&e, &id);
    let token = TokenClient::new(&e, &id);

    client.mint(&alice, &1_000i128);
    token.transfer(&alice, &bob, &400i128);
    assert_eq!(token.balance(&alice), 600i128);
    assert_eq!(token.balance(&bob), 400i128);
}
