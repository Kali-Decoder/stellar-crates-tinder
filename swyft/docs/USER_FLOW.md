# User flow

User-visible journey for the **default Stellar mock UI** (`npm run dev`). Brand: **swyft.fun**.

## Navigation

Before wallet connect: landing + theme toggle + **Sign in**.

After Freighter connect and plan save, primary nav:

| Tab | Purpose |
|---|---|
| **Basket** | Swipe cards, budget rail, open review |
| **Portfolio** | Positions / holdings surface |
| **Activity** | Latest basket receipt (demo or on-chain) |
| **Account** | Address, plan summary, disconnect / reset |

Network chip shows Stellar testnet. Stablecoin label is **USDC** (DEMOUSD on-chain).

## 1. Landing

Dark branded landing: hero **swyft.fun**, short pitch, CTA to connect. Basket preview cards are marketing only — no funds move.

**Sign in** opens Freighter via Stellar Wallets Kit. Failure shows a recoverable error; success moves to onboarding.

## 2. Onboarding (plan)

Side-by-side welcome + questions (stacks on narrow screens):

1. **Investment period** — daily / weekly / monthly.
2. **Period limit** — max USDC for the cadence window.
3. **Decision size** — USDC per Add.
4. **Risk** — conservative / balanced / degen (affects fixture mix).
5. **Asset mix** — crypto / tokenized stocks / both.

Review step requires disclosure acknowledgement. **Save plan** opens a session + feed from mock fixtures (no Privy).

## 3. Session and feed

Mock API:

1. Opens a cadence session with a mock epoch id.
2. Builds a feed from `ASSET_REGISTRY` fixtures, preferring vault-deployed symbols (`AAPL`, `NVDA`, `MSFT`, …).
3. Returns paginated cards; client requests more as the user nears the end of the deck.

No on-chain calls during browsing. Card prices/history are fixture / chart helpers only.

## 4. Building a basket

Each card: mark, name, ticket size, chart, tags, ranking blurb.

- **Skip** — advance without spending budget.
- **Add** — include asset if another ticket fits the period limit.
- **Review basket** — enabled with ≥ 1 selection.

Budget rail: selected count, ticket size, remaining budget, cadence, Stellar chip.

## 5. Review

Opening review prepares a mock execution plan (quotes / expiry for UX). Live wallet DEMOUSD balance is read via Soroban RPC when possible.

Each line shows whether the symbol is **Stellar** (in `deploy.json`) or **not on vault** (skipped on-chain).

Disclosures:

- Live path: create_bucket → approve → deposit; three Freighter prompts.
- Mixed basket: skipped symbols listed; equal weight across on-chain symbols.

Actions:

| Button | Behavior |
|---|---|
| **Back** | Return to swipe |
| **Refresh quotes** | Re-run mock prepare |
| **Invest on Stellar** | `investBasket` — 3 signed txs |
| **Simulate only** | Local demo settle, no broadcast |

Status line updates while signing (`Creating…` / `Approving…` / `Depositing…`). Errors (e.g. insufficient DEMOUSD) stay on the review screen.

## 6. Receipt (Activity)

After settle:

- **Simulate only** → demo receipt (`demoMode`), no explorer claim of broadcast.
- **Invest on Stellar** → `SETTLED` with create / approve / deposit hashes; links to Stellar Expert; receipt labels **Stellar** / USDC.

Confetti and portfolio CTA follow settlement.

## 7. Portfolio and account

**Portfolio** shows mock/selected holdings style UI for the Stellar surface.

**Account** shows short Freighter address, plan prefs, reset plan, disconnect (returns to landing).

## Mode differences

| Surface | Default mock UI | Simulate only | Invest on Stellar |
|---|---|---|---|
| Wallet | Freighter | Freighter | Freighter |
| Feed | Fixtures | Fixtures | Fixtures |
| Settlement | — | Local mock | 3 Soroban txs |
| Receipt | — | Demo disclosure | Explorer tx links |
| DEMOUSD required | No | No | Yes (testnet mint/faucet) |

## Related

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [CONTRACTS.md](./CONTRACTS.md)
