# @swyft/server

Stellar portfolio API — baskets, activity, mark-to-market PnL, and **DEMOUSD faucet**.

## Local

```bash
cp .env.example .env
npm install
npm run dev            # http://localhost:8787
```

Vite in `../swyft` proxies `/api` → `:8787`. From the UI package: `npm run dev:stack`.

## Deploy on Render

The faucet on Render uses **Soroban RPC + `FAUCET_ISSUER_SECRET`** (no Stellar CLI).

### Option A — Blueprint

1. Push this repo to GitHub.
2. Render → **New** → **Blueprint** → select the repo (`render.yaml` at repo root).
3. Fill secrets when prompted:
   - `PUBLIC_ORIGIN` — your Vercel UI origin, e.g. `https://swyft.vercel.app`
   - `FAUCET_ISSUER_SECRET` — `S…` for issuer `GAK7…` (testnet only)
   - `MONGODB_URI` — optional Atlas URI (omit → in-memory)
4. Deploy. Health: `GET https://<service>.onrender.com/api/stellar/health`

### Option B — Manual Web Service

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Runtime | Node |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/api/stellar/health` |

**Environment**

| Key | Required | Notes |
|---|---|---|
| `PUBLIC_ORIGIN` | yes | Vercel UI URL (CORS) |
| `FAUCET_ISSUER_SECRET` | for faucet | Issuer `S…` key (`GAK7…`) |
| `MONGODB_URI` | no | Atlas; else in-memory |
| `STELLAR_USDC_CONTRACT` | no* | Defaults from `server/deploy.json` |
| `STELLAR_USDC_ISSUER` | no* | Must match secret’s pubkey |
| `STELLAR_RPC_URL` | no | Default testnet RPC |
| `PORT` | auto | Render sets this |

\* Bundled in `server/deploy.json`; override after a redeploy if contract IDs change.

### Point the Vercel UI at Render

Rebuild the client with:

```bash
VITE_MOCK_UI=true
VITE_API_BASE_URL=https://<your-render-service>.onrender.com
npm run build
```

Any connected Freighter wallet can then call `POST /api/stellar/faucet` and receive a DEMOUSD drip (after trustline).

### Free-tier note

Render free services sleep when idle — first faucet/portfolio call after sleep can take ~30–60s.
