import {
	ArrowDownToLine,
	ChevronDown,
	HandCoins,
	LoaderCircle,
	RefreshCw,
	Scale,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AssetMark } from "../components/AssetMark";
import { stellarConfig, USDC_DECIMALS } from "../stellar/config";
import {
	approveShareSpending,
	getBucket,
	getLatestLedger,
	planRebalance,
	type RebalancePlan,
	readShareBalance,
	readShareSupply,
	rebalanceBucket,
	withdrawShares,
	previewWithdraw,
} from "../stellar/vault";
import { recordBasketRebalance, recordBasketWithdraw } from "../stellar/portfolio-api";
import {
	getWalletPortfolio,
	type StellarBasketRecord,
	type WalletPortfolioPayload,
} from "../stellar/portfolio-api";
import { buildDemoPortfolio } from "./mock-portfolio-fixtures";

const usdFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 2,
});

type SortKey = "value" | "pnl" | "name";

/** Per-wallet Stellar baskets (one owner per bucket) + marked PnL. */
export function MockPositions({
	wallet,
}: {
	wallet: string;
	candidates?: unknown;
}) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [portfolio, setPortfolio] = useState<WalletPortfolioPayload>();
	const [demoPreview, setDemoPreview] = useState(false);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [sortKey, setSortKey] = useState<SortKey>("value");
	const [reloadKey, setReloadKey] = useState(0);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError("");
		setDemoPreview(false);

		const applyDemo = (reason?: string) => {
			if (cancelled) return;
			const demo = buildDemoPortfolio(wallet || "demo");
			setPortfolio(demo);
			setDemoPreview(true);
			setError(reason ?? "");
			setExpandedId(demo.baskets[0]?.id ?? null);
		};

		if (!wallet) {
			applyDemo();
			setLoading(false);
			return () => {
				cancelled = true;
			};
		}

		void getWalletPortfolio(wallet)
			.then((data) => {
				if (cancelled) return;
				if (!data.baskets.length) {
					applyDemo();
					return;
				}
				setPortfolio(data);
				setDemoPreview(false);
				setExpandedId(data.baskets[0]?.id ?? null);
			})
			.catch(() => {
				applyDemo(
					"Live portfolio API unavailable — showing demo baskets for UI preview.",
				);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [wallet, reloadKey]);

	const baskets = useMemo(() => {
		const list = [...(portfolio?.baskets ?? [])];
		list.sort((a, b) => {
			if (sortKey === "name") return a.name.localeCompare(b.name);
			if (sortKey === "pnl") return b.pnl.pnlPct - a.pnl.pnlPct;
			return b.pnl.currentNavUsd - a.pnl.currentNavUsd;
		});
		return list;
	}, [portfolio, sortKey]);

	function toggleBasket(id: string) {
		setExpandedId((current) => (current === id ? null : id));
	}

	const liveBaskets = useMemo(
		() =>
			baskets.filter(
				(b) => b.vaultAddress === stellarConfig.vault && b.bucketId > 0,
			),
		[baskets],
	);

	return (
		<main className="positions-page">
			<header className="positions-heading">
				<div>
					<span className="eyebrow">Portfolio</span>
					<h1>Your Stellar baskets</h1>
					<p>
						Each swipe session creates your own on-chain bucket. Track cost
						basis and marked PnL here.
					</p>
				</div>
				<button
					type="button"
					className="positions-refresh"
					onClick={() => setReloadKey((value) => value + 1)}
					disabled={loading}
				>
					<RefreshCw size={15} strokeWidth={2.4} aria-hidden="true" />
					Refresh
				</button>
			</header>

			{demoPreview ? (
				<div className="demo-preview-banner" role="status">
					Showing sample baskets until your wallet has live positions.
				</div>
			) : null}

			{loading ? (
				<div className="positions-loading">
					<LoaderCircle />
					<span>Loading baskets…</span>
				</div>
			) : null}

			{error && !demoPreview ? (
				<div className="error-message" role="alert">
					{error}
				</div>
			) : null}

			{portfolio ? (
				<section className="portfolio-summary" aria-label="Portfolio summary">
					<div className="portfolio-summary-meta">
						<span>Total marked value</span>
						<div className="portfolio-summary-value-row">
							<strong>{usdFormatter.format(portfolio.currentNavUsd)}</strong>
						</div>
					</div>
					<div className="portfolio-stat-grid">
						<button
							type="button"
							className={`portfolio-stat${sortKey === "value" ? " is-active" : ""}`}
							onClick={() => setSortKey("value")}
						>
							<small>Cost basis</small>
							<strong>{usdFormatter.format(portfolio.costBasisUsd)}</strong>
						</button>
						<button
							type="button"
							className={`portfolio-stat${sortKey === "pnl" ? " is-active" : ""}`}
							onClick={() => setSortKey("pnl")}
						>
							<small>Marked PnL</small>
							<strong
								className={portfolio.pnlUsd >= 0 ? "pnl-up" : "pnl-down"}
							>
								{portfolio.pnlUsd >= 0 ? "+" : ""}
								{usdFormatter.format(portfolio.pnlUsd)}
							</strong>
							<em>{portfolio.pnlPct.toFixed(2)}%</em>
						</button>
						<button
							type="button"
							className={`portfolio-stat${sortKey === "name" ? " is-active" : ""}`}
							onClick={() => setSortKey("name")}
						>
							<small>Baskets</small>
							<strong>{portfolio.basketCount}</strong>
						</button>
					</div>
					<p className="portfolio-sort-hint">
						Tap a stat to sort baskets by value, PnL, or name. Expand a row for
						leg marks.
					</p>
				</section>
			) : null}

			{!loading && portfolio && !portfolio.baskets.length ? (
				<div className="empty-page">
					<HandCoins size={28} />
					<h2>No baskets yet</h2>
					<p>Invest on Stellar from Review to create your first personal bucket.</p>
				</div>
			) : null}

			<div className="positions-list" role="list">
				{baskets.map((basket) => {
					const open = expandedId === basket.id;
					const positive = basket.pnl.pnlUsd >= 0;
					return (
						<article
							className={`basket-card${open ? " is-open" : ""}${positive ? " is-up" : " is-down"}`}
							key={basket.id}
							role="listitem"
						>							<button
								type="button"
								className="basket-card-toggle"
								aria-expanded={open}
								onClick={() => toggleBasket(basket.id)}
							>
								<div className="basket-card-main">
									<div className="basket-card-title">
										<strong>
											{basket.name}
											<span>#{basket.bucketId}</span>
										</strong>
										<small>
											{basket.sharesOutstanding} shares ·{" "}
											{basket.allocations.length} assets
										</small>
									</div>
									<ul className="basket-asset-tags" aria-label="Allocations">
										{basket.allocations.map((leg) => (
											<li key={`${basket.id}-${leg.symbol}`}>
												<span className="basket-asset-tag">
													<AssetMark
														symbol={leg.symbol}
														size="sm"
													/>
													{leg.symbol}
													<em>{(leg.targetBps / 100).toFixed(0)}%</em>
												</span>
											</li>
										))}
									</ul>
								</div>
								<div className="basket-card-metrics">
									<span>{usdFormatter.format(basket.pnl.currentNavUsd)}</span>
									<small className={positive ? "pnl-up" : "pnl-down"}>
										{positive ? "+" : ""}
										{usdFormatter.format(basket.pnl.pnlUsd)} (
										{basket.pnl.pnlPct.toFixed(2)}%)
									</small>
									<ChevronDown
										className="basket-card-chevron"
										size={18}
										strokeWidth={2.4}
										aria-hidden="true"
									/>
								</div>
							</button>

							{open ? (
								<div className="basket-card-detail">
									<div className="basket-weight-bar" aria-hidden="true">
										{basket.allocations.map((leg) => (
											<span
												key={`${basket.id}-bar-${leg.symbol}`}
												style={{ flexGrow: leg.targetBps }}
												title={`${leg.symbol} ${(leg.targetBps / 100).toFixed(0)}%`}
											/>
										))}
									</div>
									<ul className="basket-leg-list">
										{basket.pnl.marks.map((mark) => (
											<li key={`${basket.id}-mark-${mark.symbol}`}>
												<div className="basket-leg-head">
													<AssetMark symbol={mark.symbol} size="sm" />
													<div>
														<strong>{mark.symbol}</strong>
														<small>
															{(mark.targetBps / 100).toFixed(0)}% target · deposit{" "}
															{usdFormatter.format(mark.priceAtDepositUsd)} → now{" "}
															{usdFormatter.format(mark.priceNowUsd)}
														</small>
													</div>
												</div>
												<div className="basket-leg-metrics">
													<span>{usdFormatter.format(mark.legNavUsd)}</span>
													<small
														className={
															mark.legPnlUsd >= 0 ? "pnl-up" : "pnl-down"
														}
													>
														{mark.legPnlUsd >= 0 ? "+" : ""}
														{usdFormatter.format(mark.legPnlUsd)} (
														{mark.legPnlPct.toFixed(1)}%)
													</small>
												</div>
											</li>
										))}
									</ul>
									<p className="basket-card-note">{basket.pnl.note}</p>
									{liveBaskets.some((b) => b.id === basket.id) && wallet ? (
										<BasketActions
											basket={basket}
											wallet={wallet}
											onDone={() => setReloadKey((value) => value + 1)}
										/>
									) : null}
								</div>
							) : null}
						</article>
					);
				})}
			</div>
		</main>
	);
}

const WITHDRAW_PCTS = [25, 50, 100];

/** Withdraw + rebalance controls for a live on-chain basket. */
function BasketActions({
	basket,
	wallet,
	onDone,
}: {
	basket: StellarBasketRecord & { pnl: { currentNavUsd: number } };
	wallet: string;
	onDone: () => void;
}) {
	const [shareBalance, setShareBalance] = useState<bigint>();
	const [shareToken, setShareToken] = useState<string>();
	const [supply, setSupply] = useState<bigint>();
	const [plan, setPlan] = useState<RebalancePlan>();
	const [loading, setLoading] = useState(true);
	const [pct, setPct] = useState<number>(100);
	const [preview, setPreview] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState<"" | "withdraw" | "rebalance">("");
	const [statusLine, setStatusLine] = useState("");
	const [error, setError] = useState("");

	const loadChain = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const bucket = await getBucket(basket.bucketId);
			setShareToken(bucket.shareToken);
			const [balance, totalSupply] = await Promise.all([
				readShareBalance(bucket.shareToken, wallet),
				readShareSupply(bucket.shareToken),
			]);
			setShareBalance(balance);
			setSupply(totalSupply);
			setPreview({});
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Bucket not found on-chain.");
		} finally {
			setLoading(false);
		}
	}, [basket.bucketId, wallet]);

	useEffect(() => {
		void loadChain();
		void planRebalance(basket.bucketId)
			.then(setPlan)
			.catch(() => setPlan(undefined));
	}, [loadChain, basket.bucketId]);

	useEffect(() => {
		if (!shareBalance || !supply || shareBalance === 0n) return;
		let cancelled = false;
		const shares = (shareBalance * BigInt(pct)) / 100n;
		void (async () => {
			try {
				const out = await previewWithdraw(basket.bucketId, shares);
				if (cancelled) return;
				const symbolByAsset = new Map(
					basket.allocations.map((leg) => [leg.asset, leg.symbol]),
				);
				setPreview(
					Object.fromEntries(
						Object.entries(out)
							.filter(([, amount]) => amount > 0n)
							.map(([asset, amount]) => [
								symbolByAsset.get(asset) ?? "USDC",
								formatBase(amount, asset === stellarConfig.usdc ? USDC_DECIMALS : 8),
							]),
					),
				);
			} catch {
				if (!cancelled) setPreview({});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [basket.allocations, basket.bucketId, pct, shareBalance, supply]);

	async function confirmWithdraw() {
		if (!shareBalance || !shareToken || busy) return;
		const shares = (shareBalance * BigInt(pct)) / 100n;
		if (shares <= 0n) return;
		setBusy("withdraw");
		setError("");
		try {
			setStatusLine("Approving share burn — sign in Freighter…");
			const ledger = await getLatestLedger();
			await approveShareSpending({
				source: wallet,
				shareToken,
				amount: shares,
				expirationLedger: ledger + 2_000,
			});
			setStatusLine(`Withdrawing ${pct}% — sign in Freighter…`);
			const { hash } = await withdrawShares({
				source: wallet,
				bucketId: basket.bucketId,
				shares,
			});
			const usdAmount =
				shareBalance > 0n && supply
					? (basket.pnl.currentNavUsd * Number(shares)) / Number(supply)
					: 0;
			await recordBasketWithdraw(basket.id, {
				usdAmount,
				shares: shares.toString(),
				txHash: hash,
				tags: ["withdraw", "freighter"],
			});
			setStatusLine(`Withdrawal settled — ${formatBase(shares, 8)} shares burned.`);
			onDone();
			void loadChain();
		} catch (caught) {
			setStatusLine("");
			setError(caught instanceof Error ? caught.message : "Withdrawal failed.");
		} finally {
			setBusy("");
		}
	}

	async function confirmRebalance() {
		if (busy) return;
		setBusy("rebalance");
		setError("");
		try {
			setStatusLine("Rebalancing to targets — sign in Freighter…");
			const { hash, plan: executed } = await rebalanceBucket({
				source: wallet,
				bucketId: basket.bucketId,
			});
			await recordBasketRebalance(basket.id, {
				txHash: hash,
				tags: ["rebalance", "freighter"],
				meta: {
					symbols: executed.legs
						.filter((leg) => leg.action !== "hold")
						.map((leg) => leg.symbol),
				},
			});
			setStatusLine(
				executed.needed
					? `Rebalanced ${executed.legs.filter((l) => l.action !== "hold").length} legs.`
					: "Already within drift band.",
			);
			onDone();
			void planRebalance(basket.bucketId).then(setPlan).catch(() => {});
		} catch (caught) {
			setStatusLine("");
			setError(caught instanceof Error ? caught.message : "Rebalance failed.");
		} finally {
			setBusy("");
		}
	}

	const driftingLegs = plan?.legs.filter((leg) => leg.action !== "hold") ?? [];

	return (
		<div className="basket-actions" aria-label={`Manage ${basket.name}`}>
			<div className="basket-actions-row">
				<div className="basket-action-block">
					<small>
						Shares owned:{" "}
						{loading
							? "…"
							: shareBalance !== undefined
								? formatBase(shareBalance, 8)
								: "unavailable"}
					</small>
					{!loading && shareBalance !== undefined && shareBalance > 0n ? (
						<>
							<div className="basket-pct-row">
								{WITHDRAW_PCTS.map((option) => (
									<button
										key={option}
										type="button"
										className={`button button-outline basket-pct${pct === option ? " is-active" : ""}`}
										disabled={busy !== ""}
										onClick={() => setPct(option)}
									>
										{option}%
									</button>
								))}
							</div>
							{Object.keys(preview).length ? (
								<small className="basket-withdraw-preview">
									Payout ≈{" "}
									{Object.entries(preview)
										.map(([symbol, amount]) => `${amount} ${symbol}`)
										.join(", ")}
								</small>
							) : null}
							<button
								type="button"
								className="button button-outline"
								disabled={busy !== "" || loading}
								onClick={() => void confirmWithdraw()}
							>
								{busy === "withdraw" ? (
									<LoaderCircle className="spin" size={16} />
								) : (
									<ArrowDownToLine size={16} />
								)}
								Withdraw {pct}%
							</button>
						</>
					) : null}
				</div>

				<div className="basket-action-block">
					<small>
						{driftingLegs.length
							? `${driftingLegs.length} leg(s) outside ${DRIFT_LABEL}: ${driftingLegs
									.map(
										(leg) =>
											`${leg.symbol} ${leg.action} $${Math.abs(leg.driftUsd).toFixed(2)}`,
									)
									.join(", ")}`
							: "All legs within drift band."}
					</small>
					<button
						type="button"
						className="button button-outline"
						disabled={busy !== "" || loading}
						onClick={() => void confirmRebalance()}
					>
						{busy === "rebalance" ? (
							<LoaderCircle className="spin" size={16} />
						) : (
							<Scale size={16} />
						)}
						Rebalance
					</button>
				</div>
			</div>
			{statusLine ? <small className="basket-action-status">{statusLine}</small> : null}
			{error ? (
				<small className="basket-action-error" role="alert">
					{error}
				</small>
			) : null}
		</div>
	);
}

const DRIFT_LABEL = "±2% target";

function formatBase(value: bigint, decimals: number): string {
	const fixed = (Number(value) / 10 ** decimals).toFixed(4);
	return fixed.replace(/\.?0+$/, "");
}
