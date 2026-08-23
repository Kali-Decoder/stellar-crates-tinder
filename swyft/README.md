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
| `npm run dev:stack` | UI + portfolio API (`../server` on :8787) — required for DEMOUSD faucet |
| `npm run build:contracts` | Build Soroban wasm (`wasm32v1-none`) |
| `npm run test:contracts` | Build wasm, then `cargo test --workspace` |
| `npm run oracle:update` | Push DIA spots → on-chain `dia-oracle` |
| `npm run faucet:demousd -- G… [--friendbot]` | Mint testnet DEMOUSD to a Freighter address |

Wallet connect uses [`@creit.tech/stellar-wallets-kit`](https://github.com/Creit-Tech/Stellar-Wallets-Kit) (Freighter) on Testnet.

Product docs in the UI: click **Docs**. Written guide: [`docs/PRODUCT_GUIDE.md`](./docs/PRODUCT_GUIDE.md).

## Repository layout

| Path | What it is |
|---|---|
| `../server/` | Stellar portfolio Express API (Mongo or in-memory) + DEMOUSD faucet |
| `docs/STELLAR_PORTFOLIO_API.md` | Portfolio API reference |
| `src/client/stellar/` | Kit, RPC, vault invest, **DIA RWA charts/spot** (`dia-api.ts`) |
| `src/client/stellar/deploy.json` | **UI source of truth** for vault / USDC / oracle / token addresses |
| `scripts/.stellar-deploy.json` | Deploy script state (mirror into `deploy.json` after bring-up) |
| `src/data/rwa-catalog.json` | Full RWA catalog (symbols, types, DIA endpoints) |
| `src/client/mock/` | Default product surface |
| `src/domain/` | Shared schemas, budgets, tags, policy helpers |
| `contracts/` | Soroban workspace: `bucket-vault`, `share-token`, `dia-oracle` |
| `scripts/` | Deploy, oracle fetch/update, faucet, create-bucket helpers |
| `docs/` | Architecture, user flow, contracts, **PRODUCT_GUIDE** |
| In-app **Docs** | Landing header/footer + primary nav after sign-in |
| `tests/` | Vitest for client/domain still used by the UI |

Set `MONGODB_URI` in `../server/.env` (or `swyft/.env`) for persistence. Without it the API uses an in-memory store.

## Product flow (short)

1. Land on swyft.fun → **Sign in** with Freighter (**Testnet**).
2. Set cadence, period limit, ticket size, risk, asset mix.
3. Swipe assets into a basket (vault-deployed symbols preferred).
4. Profile / Review → **Get testnet DEMOUSD** (Friendbot XLM + mint) if needed.
5. Review → **Invest on Stellar** signs three txs: `create_bucket` → USDC `approve` → `deposit` (each user gets their **own** bucket; many baskets per wallet are supported).
6. Basket metadata + PnL are stored via `/api/stellar/*` (Mongo when `MONGODB_URI` is set).
7. Hold share tokens; receipt links to [Stellar Expert](https://stellar.expert/explorer/testnet).

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
- **`dia-oracle`** — DIA-shaped `read_oracle_value(key) → (price_8dec, ts)`; fed by `scripts/update-oracle-feeds.mjs` / `price-updater.mjs`.

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
node scripts/update-oracle-feeds.mjs --watch    # keep oracle feeds fresh (batched set_prices)
# deploy script syncs src/client/stellar/deploy.json automatically
```

CLI identities used by deploy / faucet: `demo-admin`, `demo-usdc-issuer` — auto-generated + friendbot-funded by the deploy script when missing. Full reset: delete `scripts/.stellar-deploy.json` + `src/client/stellar/deploy.json`, then redeploy (old state files pin old addresses).

### Lifecycle after invest

`deposit` holds funds as idle USDC → **Rebalance** (Portfolio, one signature) deploys into target weights against vault pools — ±2% drift band, $1 min trade, UI sends 1% slippage bound via `min_outs`. **Withdraw** is two signatures: share-token `approve(vault)` allowance, then `withdraw(shares)` burns shares for the pro-rata payout of all holdings + idle USDC.

### Toolchain

- `soroban-sdk = "23"` / `wasm32v1-none`
- OpenZeppelin `stellar-tokens` / `stellar-macros` pinned `=0.5.0`
- `ed25519-dalek = "=2.2.0"` (testutils compatibility)

---

## Live testnet deployment

Network: **Stellar Testnet** · Explorer: [stellar.expert/testnet](https://stellar.expert/explorer/testnet)  
UI config file: [`src/client/stellar/deploy.json`](./src/client/stellar/deploy.json)  
Deploy state: [`scripts/.stellar-deploy.json`](./scripts/.stellar-deploy.json)

### Core addresses

| Role | Address |
|---|---|
| **Admin** (`demo-admin`) | `GDVJOVCZBKQY5FIDMRFDEVCQ3M6MP2BG4KYPDO6FJ2KUOLQPUWIEIW2M` |
| **DEMOUSD issuer** (`demo-usdc-issuer`) | `GAK7PGZIGH2ASZY6LF762ACROPQGBF7X4ZNUMPIMMOEP5ZFTGWTSA4TY` |
| **dia-oracle** | [`CDME5DBWV5CRHY6WHIN2KPDLMPJVHKH2J3PWY6AFILIC7HRZHAJF2T6A`](https://stellar.expert/explorer/testnet/contract/CDME5DBWV5CRHY6WHIN2KPDLMPJVHKH2J3PWY6AFILIC7HRZHAJF2T6A) |
| **DEMOUSD (SAC, 7 decimals)** | [`CDLPZ6OAYSNO4LNXKL3GCLG57KTOQRBXWEE775XO3CUC4Y7GOBV2CRAA`](https://stellar.expert/explorer/testnet/contract/CDLPZ6OAYSNO4LNXKL3GCLG57KTOQRBXWEE775XO3CUC4Y7GOBV2CRAA) |
| **bucket-vault** | [`CDRVFECRSEWANIVJJVGGPPAM4VKKDVJLL2NQYRZQNNQN3P27AH4EELKQ`](https://stellar.expert/explorer/testnet/contract/CDRVFECRSEWANIVJJVGGPPAM4VKKDVJLL2NQYRZQNNQN3P27AH4EELKQ) |
| **share-token wasm hash** | `62d2e1ad01c76bb7f6ca8c244e0341b9e0f9a11a66482154cad45422caf118d0` |

Settlement asset in the UI is labeled **USDC**; on-chain it is the **DEMOUSD** SAC above. Classic code: `DEMOUSD:GAK7PGZIGH2ASZY6LF762ACROPQGBF7X4ZNUMPIMMOEP5ZFTGWTSA4TY`.

### Oracle feed IDs

On-chain keys are **`SYMBOL/USD`** with **8-decimal** USD prices (`read_oracle_value("AAPL/USD") → (price_8dec, updated_at)`).

Always written by the updater (in addition to asset feeds):

| Feed ID | Meaning |
|---|---|
| `USDC/USD` | Pegged `$1.00` (8 decimals = `100000000`) |

Asset feeds for the **30 vault-deployed pools** (DIA RWA → oracle):

| Symbol | Type | Oracle feed ID | Token contract |
|---|---|---|---|
| AAPL | Stock | `AAPL/USD` | `CCFYBBF3XIGKIVDT7S7FTBFBRO5M7GZ7ZIRMVH72WEMBUYIGX4YAKE6V` |
| AMD | Stock | `AMD/USD` | `CAU6J5HJ7UOOYU24NP75XFIMG66BAKI7UJG6IP26HMPVTEHWBQTPPVCR` |
| AMZN | Stock | `AMZN/USD` | `CB45EFZZNN2B3JCD35DHBAHLWKLQRPMDXUY46QZ562RNU6CA3V25WJ52` |
| DIS | Stock | `DIS/USD` | `CCM4RBKSHKN4QWDV76W7GUYVYZTNPPOCJF755ZTBEMANBYF7EMHF5NUF` |
| GOOG | Stock | `GOOG/USD` | `CAYW6YZTYUYQZPOYHWW37JJAWP2ETSQAF6LYJHMXPQLEK34F3OKSATKM` |
| JNJ | Stock | `JNJ/USD` | `CDDZIIJUN5QIYX6EM25AXE7GUB3V3HJG42MEXQOMODT6W6U7QRZFYKFQ` |
| JPM | Stock | `JPM/USD` | `CDJ7LCX7KMKL5QY3NPMDM7MKPSW2KKWXSK4NI4KNUHI26GFVEP6MCXSV` |
| KO | Stock | `KO/USD` | `CDVPSY4R4LZGNURCMAIXW4CNZ3WAA4J6RPDCIBXZR5XX6CWDZN37DAUC` |
| META | Stock | `META/USD` | `CCKVKUR5DXFUTAET5IOQTRZWW6ETYFNO27TMHURTGAXKJ7L4UJ5BWLII` |
| MSFT | Stock | `MSFT/USD` | `CAOZ5TJTEMTYNWPBNDEPMNYATKFQG56PWXNYD4SACTN2PILMQ62YZT7E` |
| NFLX | Stock | `NFLX/USD` | `CAD7M6FVUEB3GKTDIUNS35EQ2PIJIAWRLAIYP7PMWHTEQFELODLGUCKN` |
| NVDA | Stock | `NVDA/USD` | `CC7XSYW3O4X6ERQ6EFD3PZ7NSCEFYTYOTPQHOEPY5S6LPFWP2Z5I7UFT` |
| ORCL | Stock | `ORCL/USD` | `CD3FBQNBN3BNP6AN3VLB6IAOWZFNS6AI5GFTEVAI5ZQHY2KM6TF3EWAW` |
| PG | Stock | `PG/USD` | `CA6THUOBFR6J7PGHFWCFKGJ26XTI42ACG2ZHJG4CF5XQOEVVYKDPGKZR` |
| TSLA | Stock | `TSLA/USD` | `CCCWBXCHOQHK5TAAMAKZZYL36NSXXP5CDTRY534GECZ6W5243RBWKVKN` |
| V | Stock | `V/USD` | `CAIGVSUCMRJXOJXLXWJ7LKOA7MBREBWM7YKNMTXAREDAIFDYO5WUHPVU` |
| WMT | Stock | `WMT/USD` | `CBK456SIHMCME2AIJQF74WKVFYYIURWTYG27M4GNWJALCM3YOAL5HQSX` |
| XOM | Stock | `XOM/USD` | `CD47HDOU2TYYMDKGIZT7CB5DDUQGKYQAMTVHX5S2I6MGX2NFJZ272KQL` |
| IBIT | ETF | `IBIT/USD` | `CA7JPBHKM2WIHB5VW4G66CP65WXWAYYVR7JCTCEYL6ZJHBXQG6QYRAAI` |
| IVV | ETF | `IVV/USD` | `CAT4FOF7U5PR5S47JP2PMHR3OK3SZVZR75YSH6NCCGZ6NS7ERKOUWP6P` |
| QQQ | ETF | `QQQ/USD` | `CD452FHCW7J6HIQM6NRUPNNMKP466W2C37SJDEXZVX3TRPE5FEY67CY3` |
| SPY | ETF | `SPY/USD` | `CCLNACNASCKOTUWMODJI7PZHL7N5B6EWFUD5JAU7ZBHXJ6OXYLEQCOTX` |
| TLT | ETF | `TLT/USD` | `CCGOB5XCFRY42Y6VJL23QXV7GZKMYICSJIMQTUM7PC36UNAXDPNZOQJY` |
| VOO | ETF | `VOO/USD` | `CAAUI3BLHKQTFOAISWVDS4XDH4AAQICU4CFOGVIZ2NNAMXSPMONLRR5B` |
| NG | Commodity | `NG/USD` | `CB52CF4JTZHNV2A76R3Y3MAJYPUQCEPALCJWNBT2OUXTHJO2FI3T2QHR` |
| WTI | Commodity | `WTI/USD` | `CAP45F3NIX76KCABVZWM3OTTMISZIYVVETEVCPQTGXGBDWH2HS2V5S5R` |
| XAGG | Commodity | `XAGG/USD` | `CARXGD3APQ4HV7EJ43LKJOPYPWI4KI4Q5UTKBM4Z5PFY6R4CZX27BGB4` |
| XAU | Commodity | `XAU/USD` | `CBID5UQVJHNOD7RWL6XFZKVY72IUEC4NJBNGIEVPPNXVN57YDLSCOHJT` |
| EUR | FX | `EUR/USD` | `CAGGFGAXHLRNXJQFE2QYB23RMLSJC7Z35FJD2IMA2OGN7NIA3PYMPPCO` |
| JPY | FX | `JPY/USD` | `CCI5IBAHBYCGMZZPCX7NRTBJPYVE7QHJC7FTL2G6XOV5R4Q53XHJDQBJ` |

**Counts:** 18 stocks · 6 ETFs · 4 commodities · 2 FX = **30** on-chain assets (+ DEMOUSD settlement).

**Alias:** UI symbol `GOOGL` maps to on-chain / feed `GOOG` (`GOOG/USD`).

**DIA REST mapping** (see `scripts/lib/oracle-feeds.mjs` + `src/data/rwa-catalog.json`):

| Type | DIA path pattern |
|---|---|
| Stock | `https://api.diadata.org/v1/rwa/Equities/{SYM}` |
| ETF | `…/ETF/{SYM}` |
| Commodity | `…/Commodities/{SYM}-USD` |
| FX | `…/Fiat/{SYM}-USD` |

Catalog symbols without a live DIA spot (e.g. `DGC`, `DSC`, `XG`, `BRKB`) are **not** in the current vault token set.

### Frontend integration notes

- Invest uses Freighter → `investBasket` in `src/client/stellar/vault.ts` against **`deploy.json`** addresses.
- Profile shows XLM + DEMOUSD balances and **Get testnet DEMOUSD** (`POST /api/stellar/faucet`).
- Keep oracle fresh or deposits/rebalance can hit stale/no-price errors (`staleness_secs` ≈ 72h on deploy).
- Env overrides: `VITE_STELLAR_RPC_URL`, `VITE_STELLAR_HORIZON_URL`, `VITE_STELLAR_NETWORK_PASSPHRASE`.

## Related

- Portfolio API: sibling [`../server`](../server) (`npm run dev:stack`)
- Docs: [`docs/`](./docs/)
