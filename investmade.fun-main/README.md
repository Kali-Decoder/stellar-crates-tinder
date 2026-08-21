# swyft.fun

swyft.fun is a non-custodial, fixed-budget swipe allocation app built on **Stellar**. Set a spending limit, swipe RWAs and crypto into a basket, deposit USDC, and hold share tokens backed by the basket. A keeper keeps the basket on target using real RWA prices from the [DIA](https://www.diadata.org/) oracle.

## Repository layout

| Path | What it is |
|---|---|
| `src/` | React/Vite app: landing → wallet → plan → swipe → portfolio (Stellar mock UI by default) |
| `contracts/` | Soroban smart contracts (Rust workspace): `bucket-vault`, `share-token` |
| `stellar_migration.md` | Original Stellar migration plan (superseded in parts, see below) |
| `investmade_fun.md` | Original ETHGlobal research brief (historical) |

Wallet connection uses `@creit.tech/stellar-wallets-kit` (Freighter etc.) on Testnet.

```bash
npm ci --cache .npm-cache
npm run dev        # http://localhost:5173
```

## Soroban contracts

Two contracts instead of the four proposed in `stellar_migration.md`:

```
contracts/
├── bucket-vault/          # basket factory + custody + rebalancer + internal AMM (one contract)
│   ├── src/lib.rs         # create_bucket / deposit / withdraw / rebalance / seed_pool
│   ├── src/dia.rs         # cross-contract reads from DIA's oracle, fail-closed staleness
│   └── src/test.rs        # mock oracle + SAC token stand-ins
└── share-token/           # OpenZeppelin SEP-41 fungible token, one instance per bucket
```

### Why two, not four

- **Factory + Vault merged.** One custody surface beats a cross-contract permission layer.
- **No custom price oracle contract.** DIA already runs an oracle on Soroban testnet (`CAEDPEZDRCEJCF73ASC5JGNKCIJDV2QJQSW6DJ6B74MYALBNKCJ5IFP4`). The vault reads it directly via CPI — no backend signing service needed.
- **No external swap router.** The migration plan proposed classic `pathPayment` (impossible from Soroban) and a Soroswap-style router. Since demo RWA tokens are issued by this project anyway, the vault embeds a minimal constant-product pool per asset (`seed_pool`, admin-seeded). Rebalancing is then pure reserve accounting inside the contract — zero CPIs, zero approvals, and production code paths are identical to test paths. Swap out `swap_via_pool` for a real router later if third-party liquidity appears.
- **Rebalancer lives inside the vault**, so the keeper calls one permissionless function.

### User flow

```
admin    create_bucket(name, allocations[], share_token_addr)
              allocations: [{asset, dia_key: "AAPL/USD", target_bps}, ...]
         seed_pool(asset, usdc_amount, asset_amount)   # admin funds swap reserves

user     deposit(bucket_id, usdc_amount)   -> mints SHARE TOKENS
             shares priced at pre-deposit NAV; first depositor gets $1 = 1 share (8 decimals)

keeper   rebalance(bucket_id, deadline, slippage_bps, min_outs[])
             sells overweight assets -> USDC, buys underweight <- USDC against the
             vault's internal pools; only when drift > drift_bps and trade > $1;
             min_outs bound any caller

user     withdraw(bucket_id, shares)       -> burns shares, pays out the pro-rata slice
             of every holding including idle USDC
```

Users never hold individual RWA tokens; they hold shares of the whole basket. Prices are never stored on tokens — every valuation reads DIA live and **fails closed** if a feed is missing or stale (`staleness_secs`, ±60 s clock-skew window).

### Contract interfaces

`bucket-vault`

| Function | Auth | Notes |
|---|---|---|
| `initialize(admin, usdc, usdc_key, dia_oracle, staleness_secs, drift_bps)` | admin | once |
| `create_bucket(name, allocations, share_token) -> id` | admin | ≤20 allocations, bps sum ≤ 10 000, no duplicate assets |
| `seed_pool(asset, usdc_amount, asset_amount)` | admin | funds the internal swap reserves; pool price = reserve ratio |
| `deposit(bucket_id, from, amount) -> shares` | depositor | pulls USDC via allowance; prices against pre-deposit NAV |
| `withdraw(bucket_id, user, shares)` | user | burns via allowance; pays pro-rata holdings |
| `rebalance(bucket_id, deadline, slippage_bps, min_outs)` | anyone | swaps via internal pools; slippage hard-capped at 10 %; dust trades (< $1) skipped |
| `get_bucket(id)`, `bucket_count()`, `holdings(id)`, `get_pool(asset)`, `portfolio_value(id)` | — | value in 8-decimal USD |

`share-token`: OpenZeppelin `stellar-tokens` SEP-41 base, 8 decimals, mint restricted to the vault, plus `bump()` for instance-TTL upkeep (keeper calls it on a schedule).

### Price data (DIA)

Feeds are keyed strings such as `AAPL/USD`; each entry returns `(price_8dec, updated_unix)`. Configure each allocation's `dia_key` to match the feeds listed at [diadata.org/app/rwa](https://www.diadata.org/app/rwa/). Testnet oracle: `CAEDPEZDRCEJCF73ASC5JGNKCIJDV2QJQSW6DJ6B74MYALBNKCJ5IFP4`.

## Build & test

```bash
cd contracts
cargo test -p bucket-vault        # 3 integration tests (shares math, pro-rata exit, stale-price fail-close)
stellar contract build            # wasm output:
# target/wasm32v1-none/release/bucket_vault.wasm
# target/wasm32v1-none/release/share_token.wasm
```

Toolchain notes:

- `soroban-sdk = "23"` matches `stellar-cli` 23.x.
- OpenZeppelin crates are pinned to `=0.5.0` — that is the release line built against sdk 23.
- `ed25519-dalek` is pinned `=2.2.0`; v3 resolves `rand_core` 0.10 which breaks `soroban-env-host` testutils compilation.

## Deploy to testnet

```bash
# once per bucket: deploy a share token whose admin is the vault address
stellar contract deploy --wasm contracts/target/wasm32v1-none/release/share_token.wasm \
  --network testnet --source <admin> \
  -- --constructor <vault_addr> "Tech Ten" TECH10   # or deploy then call __constructor args via CLI

# deploy the vault once
stellar contract deploy --wasm contracts/target/wasm32v1-none/release/bucket_vault.wasm \
  --network testnet --source <admin>

# initialize (USDC testnet asset addr, DIA oracle addr)
stellar contract invoke --id <vault> --network testnet --source <admin> -- \
  initialize --admin <admin> --usdc <usdc_addr> --usdc-key "USDC/USD" \
  --dia-oracle CAEDPEZDRCEJCF73ASC5JGNKCIJDV2QJQSW6DJ6B74MYALBNKCJ5IFP4 \
  --staleness-secs 300 --drift-bps 500

# per bucket: register the bucket, then seed swap pools at DIA prices
# (admin approves the vault on USDC + each RWA token first)
# seed_pool --asset <aapl_addr> --usdc-amount 2000000000000 --asset-amount 1000000000000
```

## Not yet implemented (deliberate)

- Concrete RWA token deployments → DIA-key mapping table (config, not code). Pool prices only track DIA if admin re-seeds reserves as feeds move; add a fee + external LPs if third parties ever trade against the pools.
- Deposit fees, emergency pause, upgradeability — YAGNI until there is TVL worth pausing.
- Security audit. Treat as MVP/hackathon-grade code.

## Historical documents

- [investmade_fun.md](./investmade_fun.md) — original hackathon brief (EVM-era, preserved for context).
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), [docs/USER_FLOW.md](./docs/USER_FLOW.md) — describe the previous Robinhood/Solana implementation paths kept in the repo for reference; they are not part of the default Stellar product surface.
