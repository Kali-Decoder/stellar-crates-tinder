# stellar-crates-tinder

```
stellar-crates-tinder/
  swyft/    # Vite client + Soroban contracts + scripts
  server/   # Stellar portfolio Express API (Mongo optional)
```

## Quick start

```bash
# UI (Stellar mock / Freighter)
cd swyft && npm install && npm run dev

# Portfolio API (optional — baskets / PnL)
cd server && npm install && npm run dev

# Or both from swyft/
cd swyft && npm run dev:stack
```
