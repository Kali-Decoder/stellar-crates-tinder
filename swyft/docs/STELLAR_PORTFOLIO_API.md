# Stellar portfolio API (Mongo)

Each Freighter user creates **their own** on-chain bucket(s). This API stores portfolio metadata + ledger and marks PnL off DIA spots.

## Run

```bash
# optional Mongo
export MONGODB_URI=mongodb://127.0.0.1:27017/swyft

# API on :8787 (Vite proxies /api → 8787)
npm run dev:stellar-api

# UI
npm run dev
# or both:
npm run dev:stack
```

Without `MONGODB_URI`, baskets are kept **in memory** (fine for local demo; lost on restart).

## Model (one owner per basket)

| Field | Meaning |
|--------|---------|
| `ownerWallet` | Freighter `G…` address |
| `bucketId` | On-chain id from `create_bucket` |
| `allocations` | Targets + `priceAtDepositUsd` for MTM |
| `costBasisUsd` | Net USD deposited |
| `sharesOutstanding` | Share token amount (string) |
| `ledger` | deposit / withdraw events |

Users can create **many** baskets; there is no shared multi-depositor basket in the product UX.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/stellar/baskets` | Record basket after invest |
| `GET` | `/api/stellar/baskets?wallet=G…` | List baskets |
| `GET` | `/api/stellar/baskets/:id` | Single basket |
| `GET` | `/api/stellar/baskets/:id/pnl` | Basket + marked PnL |
| `GET` | `/api/stellar/wallets/:wallet/portfolio` | All active baskets + totals |
| `POST` | `/api/stellar/baskets/:id/deposits` | Extra deposit ledger (rare) |
| `POST` | `/api/stellar/baskets/:id/withdrawals` | Withdraw ledger |
| `POST` | `/api/stellar/baskets/:id/close` | Mark closed |
| `GET` | `/api/stellar/health` | Health |

### Create body example

```json
{
  "ownerWallet": "G…",
  "bucketId": 3,
  "vaultAddress": "C…",
  "name": "Swyft AAPL-NVDA",
  "depositUsd": 1000,
  "shares": "100000000000",
  "createTxHash": "…",
  "approveTxHash": "…",
  "depositTxHash": "…",
  "allocations": [
    {
      "symbol": "AAPL",
      "asset": "C…",
      "diaKey": "AAPL/USD",
      "targetBps": 5000,
      "priceAtDepositUsd": 200
    },
    {
      "symbol": "NVDA",
      "asset": "C…",
      "diaKey": "NVDA/USD",
      "targetBps": 5000,
      "priceAtDepositUsd": 100
    }
  ]
}
```

## PnL method

Weighted spot mark-to-market (pre-rebalance friendly):

```text
legNav = costBasis × (bps/10000) × (spotNow / spotAtDeposit)
NAV    = Σ legNav
PnL    = NAV − costBasis
```

After keeper rebalance, prefer on-chain `portfolio_value` for exact vault NAV.
