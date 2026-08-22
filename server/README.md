# @swyft/server

Stellar portfolio API — baskets, ledger, mark-to-market PnL.

```bash
cp .env.example .env   # set MONGODB_URI if you want persistence
npm install
npm run dev            # http://localhost:8787
```

Vite in `../swyft` proxies `/api` → `:8787`. From the UI package: `npm run dev:stack`.
