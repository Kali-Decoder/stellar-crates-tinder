# Contracts & Stellar test matrix

Separates automated contract/UI checks from manual Freighter settlement. A simulation or mock receipt is not settlement proof.

Automated gate last verified: update when you re-run.

## Automated — contracts

| Area | Scenario | Evidence | Result |
|---|---|---|---|
| Oracle | set/read roundtrip + missing → zero | `cargo test -p dia-oracle` | Pass via `npm run test:contracts` |
| Oracle | non-admin cannot write | `dia-oracle` `non_admin_cannot_write` | Pass |
| Oracle | length mismatch panics | `set_prices_rejects_length_mismatch` | Pass |
| Shares | mint + 8-dec metadata | `cargo test -p share-token` | Pass |
| Shares | non-admin mint fails | `non_admin_cannot_mint` | Pass |
| Shares | burn reduces balance | `burn_reduces_balance` | Pass |
| Vault | deposit, NAV, rebalance holdings | `deposit_shares_nav_rebalance` | Pass |
| Vault | withdraw burns + pro-rata assets | `withdraw_pays_pro_rata_slice_and_burns` | Pass |
| Vault | stale oracle fails deposit/NAV | `stale_price_fails_closed` | Pass |
| Vault | bad alloc / zero deposit / double init / missing bucket | unit tests in `bucket-vault/src/test.rs` | Pass |
| Vault | create_bucket with real share wasm | `tests/repro.rs` | Pass |

```bash
npm run test:contracts
```

## Automated — UI / domain

| Area | Scenario | Evidence | Result |
|---|---|---|---|
| Client suite | Vitest client/domain | `npm test` (10 files) | Pass |
| Review safety | Basket change blocks stale plan signing | `tests/review-safety.test.ts` | Pass |
| Charts / tags / budgets | Animation, history, tags, epoch, price format | remaining `tests/*.test.ts` | Pass |

## Manual — Freighter + testnet

| Area | Scenario | Evidence | Result |
|---|---|---|---|
| Connect | Freighter Testnet address in UI | Browser | Pending |
| Balance | DEMOUSD balance shown on review | RPC `balance` | Pending |
| Invest | 3 signatures; bucket + shares minted | Explorer hashes | Pending |
| Skip | Non-deployed symbols disclosed and skipped | Review copy | Pending |
| Simulate | Demo receipt without broadcast | Activity | Pending |
| Fail closed | No DEMOUSD → clear error | Review alert | Pending |

Record Freighter address, bucket id, and tx hashes below when marking Pass:

```
Address:
Bucket id:
create_bucket:
approve:
deposit:
```

## Related

- [CONTRACTS.md](./CONTRACTS.md)
- [STELLAR_CHECKLIST.md](./STELLAR_CHECKLIST.md)
