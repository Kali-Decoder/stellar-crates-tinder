import { ChevronDown, HandCoins, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AssetMark } from "../components/AssetMark";
import {
	getWalletPortfolio,
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
						>
							<button
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
								</div>
							) : null}
						</article>
					);
				})}
			</div>
		</main>
	);
}
