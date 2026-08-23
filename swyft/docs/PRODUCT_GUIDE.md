# swyft.fun product guide

In-app docs mirror this guide: open **Docs** from the landing header/footer or the primary nav after sign-in.

## What it is

swyft.fun is a **non-custodial** swipe ritual for tokenized RWAs on **Stellar**. You set a budget, add assets from a feed, then deposit with Freighter. Swyft never holds keys.

## Quick start

```bash
# UI
cd swyft && npm install && npm run dev

# UI + Mongo portfolio API
cd swyft && npm run dev:stack
```

1. Open http://localhost:5173  
2. **Docs** — product guide in the app  
3. **Sign in** — Freighter on Stellar testnet  
4. Save a plan → swipe → **Review** → **Invest on Stellar** or **Simulate only**

Testnet stablecoin is **DEMOUSD** (labeled **USDC** in the UI).

## User journey

| Step | What happens |
|---|---|
| Landing | Brand hero + sample basket cards |
| Onboarding | Cadence, limit, ticket, risk, asset mix |
| Basket | Swipe Add/Skip inside period budget |
| Review | Quotes + live invest (3 Freighter txs) or simulate |
| Portfolio | Buckets + marked PnL (portfolio API / Mongo) |
| Activity | Latest receipt / tx hashes |
| Account | Wallet, plan, disconnect |
| Docs | This guide, in-product (incl. architecture & rebalancing) |

## DIA oracle

- Spot prices: DIA RWA REST (`/dia-api` Vite proxy)  
- Charts: market history when available, anchored to DIA spot  
- On-chain: `dia-oracle` feeds (`AAPL/USD`, …) via `npm run oracle:update`

## Architecture

Default path: Vite `MockApp` + Freighter → Soroban RPC → `bucket-vault` / DEMOUSD / `dia-oracle`. Optional `server/` portfolio API stores basket metadata and DIA-marked PnL.

| Layer | Role |
|---|---|
| Client (`src/client`) | Landing → plan → swipe → review → portfolio |
| `stellar/` | Wallet kit, RPC, vault invest helpers, DIA spots |
| Contracts | `share-token`, `bucket-vault`, `dia-oracle` |
| `server/` | `/api/stellar/*` baskets + PnL (Mongo) |

Deeper notes: [ARCHITECTURE.md](./ARCHITECTURE.md), [CONTRACTS.md](./CONTRACTS.md).

## Rebalancing

1. **Invest** creates a bucket with equal-weight `target_bps` (sum 10_000) and deposits DEMOUSD → share mint. Holdings start as idle USDC.
2. **`rebalance(bucket_id, …)`** is permissionless on `bucket-vault`. A keeper (or anyone) can call it.
3. Vault prices legs via DIA, skips if drift ≤ `drift_bps` (~2%) or dust &lt; $1, then sells overweight / buys underweight against internal CP pools.
4. NAV always uses oracle spots (fail closed if stale). Slippage capped; `min_outs` bound caller behavior.
5. Portfolio UI marks with DIA pre-rebalance; prefer on-chain `portfolio_value` after rebalance for exact NAV.

Automated keeper scheduling is ops — not yet an in-app bot. See [CONTRACTS.md](./CONTRACTS.md) § Rebalance.

## Contracts & API

| Piece | Location |
|---|---|
| Client + contracts | `swyft/` |
| Portfolio Express API | `server/` (`/api/stellar/*`) |
| Deploy addresses | `swyft/src/client/stellar/deploy.json` |

Also:

- [USER_FLOW.md](./USER_FLOW.md)
- [STELLAR_PORTFOLIO_API.md](./STELLAR_PORTFOLIO_API.md)

## Safety

Not investment advice. Ranking and feed copy are not recommendations. Every on-chain action requires your wallet approval.
