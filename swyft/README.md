# swyft.fun

swyft.fun is a non-custodial, fixed-budget swipe allocation app on **Stellar**. Set a spending limit, swipe RWAs into a basket, deposit DEMOUSD/USDC on testnet, and hold share tokens backed by that basket. A keeper rebalances toward target weights using DIA-compatible prices.

## Quick start

```bash
npm ci --cache .npm-cache
npm run dev          # mock UI + Freighter on Stellar testnet → http://localhost:5173
npm run dev:stack    # UI + stellar portfolio API (:8787, Mongo optional)
npm run dev:stellar-api  # portfolio/baskets/PnL API only

npm test             # client/domain vitest suite
npm run test:contracts
```

| Command | Purpose |
|---|---|
| `npm run dev` | Default Stellar mock UI (`VITE_MOCK_UI=true`) |
| `npm run dev:stack` | UI + portfolio API (`../server` on :8787) |
| `npm run build:contracts` | Build Soroban wasm (`wasm32v1-none`) |
| `npm run test:contracts` | Build wasm, then `cargo test --workspace` |

Wallet connect uses [`@creit.tech/stellar-wallets-kit`](https://github.com/Creit-Tech/Stellar-Wallets-Kit) (Freighter) on Testnet.

## Repository layout

| Path | What it is |
|---|---|
| `../server/` | Stellar portfolio Express API (Mongo or in-memory) |
| `docs/STELLAR_PORTFOLIO_API.md` | Portfolio API reference |
| `src/client/stellar/` | Kit, RPC, vault invest, **DIA RWA charts/spot** (`dia-api.ts`) |
| `src/client/mock/` | Default product surface (no Express required) |
| `src/domain/` | Shared schemas, budgets, tags, policy helpers |
| `contracts/` | Soroban workspace: `bucket-vault`, `share-token`, `dia-oracle` |
| `scripts/` | Deploy, oracle fetch/update, create-bucket helpers |
| `docs/` | Architecture, user flow, contracts flow, checklists |
| `tests/` | Vitest for client/domain still used by the UI |

Set `MONGODB_URI` in `../server/.env` (or `swyft/.env`) for persistence. Without it the API uses an in-memory store.

## Product flow (short)

1. Land on swyft.fun → **Sign in** with Freighter.
2. Set cadence, period limit, ticket size, risk, asset mix.
3. Swipe assets into a basket (vault-deployed symbols preferred).
4. Review → **Invest on Stellar** signs three txs: `create_bucket` → USDC `approve` → `deposit` (each user gets their **own** bucket; many baskets per wallet are supported).
5. Basket metadata + PnL are stored via `/api/stellar/*` (Mongo when `MONGODB_URI` is set).
6. Hold share tokens; receipt links to [Stellar Expert](https://stellar.expert/explorer/testnet).

Or use **Simulate only** for a local demo receipt without broadcasting.

## Documentation

| Doc | Contents |
|---|---|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | App + client + how UI talks to Soroban |
| [docs/CONTRACTS.md](./docs/CONTRACTS.md) | **Contracts flow architecture** (vault, shares, oracle, invest path) |
| [docs/USER_FLOW.md](./docs/USER_FLOW.md) | Screen-by-screen user journey |
| [docs/STELLAR_CHECKLIST.md](./docs/STELLAR_CHECKLIST.md) | Testnet demo / release checklist |
| [docs/CONTRACTS_TEST_MATRIX.md](./docs/CONTRACTS_TEST_MATRIX.md) | Contract + UI integration test matrix |

## Contracts (summary)

Three Soroban contracts:

- **`bucket-vault`** — basket factory, USDC custody, share mint/burn, internal CP pools, rebalance.
- **`share-token`** — SEP-41 share token; one instance per bucket; vault is admin/minter.
- **`dia-oracle`** — DIA-shaped `read_oracle_value(key) → (price_8dec, ts)`; fed by `scripts/price-updater.mjs`.

Invest path from the UI:

```
create_bucket(name, allocations)
  → vault deploys share-token (admin = vault)
approve(usdc → vault)
deposit(bucket_id, amount)
  → vault pulls USDC, mints shares @ pre-deposit NAV
```

Full diagrams and invariants: [docs/CONTRACTS.md](./docs/CONTRACTS.md).

```bash
npm run test:contracts
# or
cd contracts && CARGO_TARGET_DIR=./target cargo test --workspace
```

### Deploy (testnet)

```bash
npm run build:contracts
node scripts/deploy-stellar.mjs                 # idempotent; state in scripts/.stellar-deploy.json
node scripts/price-updater.mjs --watch          # keep oracle feeds fresh
# copy deploy ids into src/client/stellar/deploy.json for the UI
```

### Toolchain

- `soroban-sdk = "23"` / `wasm32v1-none`
- OpenZeppelin `stellar-tokens` / `stellar-macros` pinned `=0.5.0`
- `ed25519-dalek = "=2.2.0"` (testutils compatibility)

## Related

- Portfolio API: sibling [`../server`](../server) (`npm run dev:stack`)
- Docs: [`docs/`](./docs/)
