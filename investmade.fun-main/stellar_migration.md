# Stellar Migration — Full Product Plan

**invest4.fun** — Stock baskets on Stellar. Non-custodial, automated rebalancing, real stock prices on-chain.

---

## 1. Why Stellar

| Factor | EVM (Robinhood Chain) | Solana | Stellar |
|--------|----------------------|--------|---------|
| **Transaction cost** | Variable gas | $0.00025 | **0.00001 XLM (~$0.000001)** |
| **Finality** | ~2s | ~400ms | **~5s** |
| **Built-in DEX** | None (need Uniswap) | None (need Jupiter) | **Native order book** |
| **Asset model** | ERC-20 | SPL | **Native issued assets** |
| **Smart contracts** | Solidity | Rust/Anchor | **Soroban (Rust)** |
| **Regulatory clarity** | Low | Low | **High (SDF, built for compliance)** |
| **Institutional adoption** | Moderate | Growing | **Strong (MoneyGram, Circle, Franklin Templeton)** |
| **Account model** | Contract-based | Program-based | **Native Ed25519** |

**Stellar's edge for this product:**
- Native DEX means no dependency on external AMMs for swaps
- Near-zero fees make micro-rebalancing viable (rebalance $10 baskets without losing to gas)
- Built-in compliance primitives (SEP-10 auth, asset restrictions) align with regulated stock tokens
- Franklin Templeton, Backed Finance, and others already issuing tokenized assets on Stellar

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Vite)                           │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Wallet   │  │  Basket  │  │Portfolio │  │  Rebalance   │   │
│  │  Connect  │  │  Builder │  │  View    │  │  Dashboard   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │              │               │           │
│       └──────────────┴──────────────┴───────────────┘           │
│                            │                                     │
│                    StellarWalletsKit / Freighter                 │
└────────────────────────────┼────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Express Server  │
                    │  (TypeScript)    │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼─────┐      ┌──────▼──────┐     ┌──────▼──────┐
   │  Price   │      │  Stellar    │     │  Rebalance  │
   │  Oracle  │      │  Adapter    │     │  Keeper     │
   │  Service │      │  (Horizon)  │     │  (Cron)     │
   └────┬─────┘      └──────┬──────┘     └──────┬──────┘
        │                    │                    │
        │              ┌─────▼──────┐             │
        │              │  Stellar   │             │
        └──────────────▶  Network   ◀─────────────┘
                         │          │
                    ┌────▼────┐┌────▼────┐
                    │Horizon  ││Soroban  │
                    │(REST)   ││RPC      │
                    └────┬────┘└────┬────┘
                         │          │
                    ┌────▼──────────▼────┐
                    │   Stellar Ledger   │
                    │   (5000+ nodes)    │
                    └───────────────────┘
```

### What Lives Where

| Component | Location | Why |
|-----------|----------|-----|
| Wallet connection | Client → Freighter/StellarWalletsKit | User signs locally |
| Basket creation | Server → Soroban `BucketFactory` | On-chain record |
| Deposits | Server → Soroban `BucketVault` | Trustless custody |
| Swaps | Built-in DEX via `pathPayment` | No AMM contract needed |
| Price feeds | Server oracle → `StockOracle` contract | Signed, verifiable |
| Rebalancing | Keeper bot → `Rebalancer` contract | Automated, on-chain |
| Portfolio tracking | Horizon queries + indexer | Real-time, no polling |
| Auth | SEP-10 challenge/sign | Stellar-native auth |

---

## 3. Soroban Contracts

### Contract 1: `BucketFactory`

Creates baskets, mints share tokens, handles deposits/withdrawals.

```rust
// Key functions:
create_bucket(name, allocations, params) → bucket_id
deposit(user, bucket_id, amount_usdc) → shares
withdraw(user, bucket_id, shares) → assets[]
get_bucket_info(bucket_id) → BucketInfo
```

**Storage model:**
- `BucketConfig`: target allocations, rebalance params, share token contract
- `ShareToken`: Stellar asset issued by the contract (code = bucket name)
- `DepositRecord`: user → shares mapping

### Contract 2: `BucketVault`

Holds all assets. Separated from Factory for security isolation.

```rust
// Key functions:
hold(bucket_id, asset) → balance
release(bucket_id, asset, amount, to) → bool  // only callable by Factory
total_value(bucket_id, prices) → usd_value
```

**Security:** Only `BucketFactory` can move assets via CPI (cross-contract invocation).

### Contract 3: `StockOracle`

On-chain price feed. Backend signs prices, contract verifies.

```rust
// Key functions:
update_price(asset, price, timestamp, signature) → bool
get_price(asset) → (price, timestamp, is_stale)
get_prices_batch(assets[]) → prices[]
```

**Trust model:**
- Backend holds oracle private key
- Contract stores allowed signers
- Prices expire after configurable staleness window
- SEP-40 compatible for composability

### Contract 4: `Rebalancer`

Automated portfolio rebalancing.

```rust
// Key functions:
rebalance(bucket_id) → SwapResult[]
can_rebalance(bucket_id) → bool
estimate_rebalance(bucket_id) → RebalanceEstimate
```

**Logic:**
1. Read current balances from Vault
2. Read target allocations from Factory
3. Read prices from Oracle
4. Compute drift per asset
5. If any drift > threshold: execute pathPayments through DEX
6. Emit events for indexing

---

## 4. Price Oracle — Real Stock Prices On-Chain

### The Pipeline

```
Yahoo Finance ──┐
                 ├──▶ Oracle Service ──▶ StockOracle Contract
Polygon.io ──────┘    (off-chain)         (on-chain, Soroban)
                     │
                     ├─ Fetch every 30s (market hours)
                     ├─ Cross-validate sources
                     ├─ Sign with Ed25519
                     └─ Submit to Stellar
```

### Price Sources

| Source | Data | Latency | Cost | Role |
|--------|------|---------|------|------|
| **Polygon.io** | Real-time US equities | <1s | $29/mo | Primary |
| **Yahoo Finance** | Full market data | ~5s | Free | Fallback |
| **Alpha Vantage** | Stocks + fundamentals | ~5s | Free tier | Backup |
| **Stellar DEX** | On-chain crypto prices | Real-time | Free | Crypto assets |

### Market Hours Logic

- **Market open** (9:30 AM – 4:00 PM ET): Update every 30s, staleness = 5 min
- **Pre/after market**: Update every 5 min, staleness = 1 hour
- **Weekends/holidays**: Freeze at last close, staleness = 24 hours
- **Circuit breaker**: If source fails, contract marks price stale, rebalancer pauses

---

## 5. User Flow

### End-to-End: Deposit → Own Basket → Rebalance

```
1. CONNECT WALLET
   User clicks "Connect Stellar Wallet"
   → Freighter / StellarWalletsKit popup
   → SEP-10 auth challenge
   → Server verifies signature

2. CHOOSE BASKET
   User browses baskets: "Tech 10", "Dividend Kings", "AI & ML"
   → Sees target allocation: AAPL 30%, NVDA 25%, MSFT 20%, GOOGL 15%, META 10%
   → Sees current price for each stock (from oracle)

3. DEPOSIT
   User enters: $100 USDC
   → Server builds Soroban transaction:
     a. User sends 100 USDC to BucketVault
     b. BucketVault swaps USDC → stocks via pathPayment (built-in DEX)
     c. BucketVault mints 112.36 "TECH10" share tokens to user
   → User signs with Freighter
   → Transaction submitted to Stellar
   → User sees: "You own 0.5% of Tech 10 basket"

4. PORTFOLIO VIEW
   User sees real-time P&L:
   → AAPL: $30.12 (+0.4%)
   → NVDA: $25.38 (+1.5%)
   → Total: $101.20 (+1.2%)
   → Share price: $0.90 (↑ from $0.89)

5. REBALANCING
   Keeper bot runs every 5 minutes:
   → Checks drift: AAPL 35% vs target 30%
   → Triggers Rebalancer.rebalance("TECH10")
   → Sells 5% AAPL → USDC → buys NVDA
   → All atomic via pathPayment
   → User's shares maintain proportional ownership

6. WITHDRAW
   User sells 50 shares:
   → Rebalancer burns 50 TECH10
   → Proportional assets returned via pathPayment
   → User receives USDC or individual stocks
```

---

## 6. Migration Phases

### Phase 1: Mock MVP (2 weeks)

**Goal:** Working demo with real prices, simulated on-chain activity.

| Task | Files | Days |
|------|-------|------|
| Add `STELLA` to chain enums | `schemas.ts`, `constants.ts` | 0.5 |
| Yahoo Finance price adapter | New: `yahoo-prices.ts` | 1 |
| Stellar demo provider | New: `stellar-demo.ts` | 1 |
| Wire into bootstrap | `bootstrap.ts`, `config.ts` | 0.5 |
| Stellar chain selector in UI | `App.tsx`, `WalletMenu.tsx` | 1 |
| Portfolio view with real prices | `PortfolioView.tsx` | 1 |
| Testing + polish | — | 2 |
| **Subtotal** | | **~7 days** |

**Deliverable:** User selects "Stellar", sees real stock prices, builds basket, views P&L. No on-chain settlement. Looks production-ready for demos.

### Phase 2: Soroban Contracts (4 weeks)

**Goal:** On-chain basket ownership, deposits, withdrawals.

| Task | Effort | Notes |
|------|--------|-------|
| `BucketFactory` contract | 1 week | Rust, Soroban testnet |
| `BucketVault` contract | 1 week | Asset custody, CPI auth |
| Share token issuance | 3 days | Stellar native assets |
| Backend: contract interaction | 1 week | Stellar SDK integration |
| SEP-10 auth integration | 2 days | Replace Privy for Stellar |
| Testnet deployment + testing | 3 days | Stellar testnet faucet |

**Deliverable:** User deposits USDC, receives on-chain share tokens, can view holdings on Stellar explorer.

### Phase 3: Price Oracle (2 weeks)

**Goal:** Real stock prices on-chain, verifiable.

| Task | Effort | Notes |
|------|--------|-------|
| `StockOracle` contract | 3 days | Soroban, signed updates |
| Oracle service (off-chain) | 3 days | Polygon.io + Yahoo fallback |
| Price signing + submission | 2 days | Ed25519, batch updates |
| Staleness detection | 1 day | Market hours logic |
| Integration testing | 2 days | End-to-end price flow |

**Deliverable:** Stock prices updated on-chain every 30s, verifiable via contract queries.

### Phase 4: Rebalancing (3 weeks)

**Goal:** Automated portfolio rebalancing, keeper bot.

| Task | Effort | Notes |
|------|--------|-------|
| `Rebalancer` contract | 1 week | Drift detection, swap execution |
| Keeper bot (serverless) | 3 days | Cron, Stellar testnet |
| pathPayment routing | 2 days | Multi-hop DEX routing |
| Rebalance events + indexing | 2 days | Horizon + custom indexer |
| Integration testing | 2 days | Full rebalance flow |

**Deliverable:** Baskets auto-rebalance when drift exceeds threshold. All on-chain, auditable.

### Phase 5: Mainnet + Stock Tokens (4-6 weeks)

**Goal:** Production deployment with real tokenized stocks.

| Task | Effort | Notes |
|------|--------|-------|
| Mainnet deployment | 1 week | All 4 contracts |
| Stock token issuer partnership | Ongoing | Backed Finance, or custom |
| Freighter/StellarWalletsKit production | 2 days | Mainnet wallet flows |
| USDC on Stellar integration | 1 day | Circle's USDC issuer |
| Security audit | 1-2 weeks | Soroban contract audit |
| Monitoring + alerting | 2 days | PagerDuty, contract events |

**Deliverable:** Production-ready on Stellar mainnet.

---

## 7. Regulatory Considerations

| Aspect | Approach |
|--------|----------|
| **Stock token issuance** | Partner with licensed broker-dealer or use existing issuer (Backed Finance, Dinari) |
| **KYC/AML** | Off-chain via Privy or integrated provider; SEP-10 for on-chain auth |
| **Asset restrictions** | Soroban contract can enforce allowlists (SEP-40 asset restrictions) |
| **Reporting** | On-chain transactions are auditable; backend tracks tax events |
| **Jurisdiction** | Start with US-friendly jurisdictions; Stellar's compliance primitives help |

**Key risk:** Tokenized securities require regulatory approval. Mock MVP avoids this by simulating. Production requires legal counsel.

---

## 8. Cost Analysis

### Transaction Costs (Stellar vs EVM)

| Operation | Stellar | Ethereum | Robinhood Chain |
|-----------|---------|----------|-----------------|
| Simple transfer | $0.000001 | $0.50-5.00 | $0.001-0.01 |
| DEX swap (pathPayment) | $0.00001 | $5.00-50.00 | $0.01-0.10 |
| Smart contract call | $0.00001-0.0001 | $10.00-100.00 | $0.05-0.50 |
| Rebalance (5 swaps) | $0.00005 | $25.00-250.00 | $0.05-0.50 |
| **Monthly rebalancing (4x)** | **$0.0002** | **$100-1000** | **$0.20-2.00** |

**Stellar advantage:** Near-zero fees make micro-rebalancing viable. A $10 basket can rebalance without losing to gas.

### Account Costs

| Item | Cost |
|------|------|
| Minimum balance (base) | 1 XLM (~$0.35) |
| Per trustline | +0.5 XLM (~$0.175) |
| Per offer | +0.5 XLM (~$0.175) |
| **Typical user account** | **~2 XLM ($0.70)** |

---

## 9. Competitive Advantage

| Feature | Traditional Brokerages | DeFi (EVM) | **invest4.fun on Stellar** |
|---------|----------------------|------------|---------------------------|
| Minimum investment | $500-5000 | $50-100 | **$10** |
| Rebalancing | Quarterly (manual) | None or manual | **Automated, on-chain** |
| Fees | 0.25-1.5% AUM | Gas + slippage | **Near-zero gas** |
| Custody | Broker holds | Smart contract | **Non-custodial Soroban** |
| Transparency | Quarterly reports | On-chain but complex | **Real-time on-chain** |
| Settlement | T+1 | Minutes | **5 seconds** |
| Stock tokens | N/A | Limited (Robinhood) | **Stellar ecosystem** |

---

## 10. Risk Matrix

| Risk | Severity | Mitigation |
|------|----------|------------|
| **No stock token issuer on Stellar** | Critical | Mock MVP first; partner with Backed Finance or build custom issuer |
| **Regulatory uncertainty** | High | Legal counsel; start with non-US jurisdictions; compliance primitives in contracts |
| **Low DEX liquidity for stocks** | High | pathPayment routes through USDC as intermediate; deep XLM/USDC liquidity |
| **Privy doesn't support Stellar** | Medium | Use Freighter/StellarWalletsKit; SEP-10 auth; different UX but functional |
| **Smart contract bugs** | High | Security audit; formal verification for critical paths; upgradeable contracts |
| **Oracle manipulation** | High | Signed prices; multi-source validation; staleness checks; circuit breakers |
| **Stellar network issues** | Low | Stellar has 99.9%+ uptime; 5000+ validators |

---

## 11. Team & Resource Requirements

| Role | Duration | Notes |
|------|----------|-------|
| **Rust/Soroban developer** | 8-12 weeks | Smart contracts (4 contracts) |
| **TypeScript backend** | 6-8 weeks | Oracle service, Stellar SDK integration |
| **TypeScript frontend** | 4-6 weeks | Wallet integration, portfolio UI |
| **DevOps** | 2-3 weeks | Testnet/mainnet deployment, monitoring |
| **Legal/Compliance** | Ongoing | Stock token regulatory approval |
| **Security auditor** | 2 weeks | Soroban contract audit |

---

## 12. Timeline Summary

```
Week 1-2:   Mock MVP (real prices, simulated on-chain)
Week 3-6:   Soroban contracts (BucketFactory, BucketVault)
Week 7-8:   Price oracle (StockOracle, backend service)
Week 9-11:  Rebalancing (Rebalancer, keeper bot)
Week 12-13: Integration testing, testnet polish
Week 14-16: Security audit
Week 17-18: Stock token issuer partnership
Week 19-20: Mainnet deployment
Week 21-24: Production launch + monitoring
```

**Total: ~6 months to production.**

Mock MVP ready in 2 weeks for demos and investor presentations.

---

## 13. Appendices

### Appendix A: Soroban Contract Details

See Appendix A in the original migration doc for full contract code examples.

### Appendix B: Price Oracle Architecture

See Appendix B in the original migration doc for full oracle implementation.

### Appendix C: Pool/Bucket Model

See Appendix C in the original migration doc for full rebalancing mechanics.

### Appendix D: Design Decisions

See Appendix D in the original migration doc for architectural rationale.
