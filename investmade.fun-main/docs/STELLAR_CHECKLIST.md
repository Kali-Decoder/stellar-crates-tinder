# Stellar testnet checklist

Checklist for the default swyft.fun Stellar path. A green vitest/cargo run is not the same as a confirmed on-chain deposit.

## Automated gate

- [ ] `npm ci`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run test:contracts`
- [ ] `npm run build`

## Local demo UI

- [ ] `npm run dev` loads landing at `http://localhost:5173`
- [ ] Theme toggle persists across reload
- [ ] Freighter connects on Testnet and shows a shortened address
- [ ] Onboarding questions validate ranges; side-by-side layout on desktop
- [ ] Swipe feed prefers vault symbols; Add respects period limit
- [ ] Review lists Stellar vs skipped symbols and shows wallet DEMOUSD when RPC works
- [ ] **Simulate only** produces a demo receipt without Freighter prompts
- [ ] Disconnect returns to landing

## Contracts / deploy

- [ ] `rustup target add wasm32v1-none`
- [ ] `npm run build:contracts` produces `bucket_vault.wasm`, `share_token.wasm`, `dia_oracle.wasm`
- [ ] `scripts/.stellar-deploy.json` exists (or run `node scripts/deploy-stellar.mjs`)
- [ ] `src/client/stellar/deploy.json` matches the intended vault / USDC / oracle / tokens
- [ ] `node scripts/price-updater.mjs` (or `--watch`) keeps feeds fresh within vault `staleness_secs`

## On-chain invest (manual)

- [ ] Freighter account is funded with XLM (Friendbot) and holds DEMOUSD
- [ ] Select ≥ 1 vault-deployed symbol (e.g. AAPL, NVDA)
- [ ] **Invest on Stellar** prompts three signatures: create_bucket, approve, deposit
- [ ] Review/receipt shows three Stellar Expert links
- [ ] `get_bucket` / share balance reflect the deposit (CLI or explorer)
- [ ] Insufficient DEMOUSD fails closed with a clear mint/faucet message

## Ops notes

- DEMOUSD uses **7** decimals; shares and DIA prices use **8**.
- Weekend stock feeds may rely on a long `staleness_secs` (deploy script uses 72h).
- Treat contracts as MVP / hackathon-grade until audited.

## Related

- [CONTRACTS.md](./CONTRACTS.md)
- [CONTRACTS_TEST_MATRIX.md](./CONTRACTS_TEST_MATRIX.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
