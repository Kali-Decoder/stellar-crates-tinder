import { HandCoins, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
	getWalletPortfolio,
	type WalletPortfolioPayload,
} from "../stellar/portfolio-api";

const usdFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 2,
});

/** Per-wallet Stellar baskets (one owner per bucket) + marked PnL. */
export function MockPositions({ wallet }: { wallet: string; candidates?: unknown }) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [portfolio, setPortfolio] = useState<WalletPortfolioPayload>();

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError("");
		void getWalletPortfolio(wallet)
			.then((data) => {
				if (!cancelled) setPortfolio(data);
			})
			.catch((caught) => {
				if (!cancelled) {
					setError(
						caught instanceof Error
							? caught.message
							: "Could not load basket portfolio. Is stellar-api running?",
					);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [wallet]);

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
			</header>

			{loading ? (
				<div className="positions-loading">
					<LoaderCircle />
					<span>Loading baskets…</span>
				</div>
			) : null}

			{error ? (
				<div className="error-message" role="alert">
					{error}
				</div>
			) : null}

			{portfolio ? (
				<section className="portfolio-summary">
					<div className="portfolio-summary-meta">
						<span>Total marked value</span>
						<div className="portfolio-summary-value-row">
							<strong>{usdFormatter.format(portfolio.currentNavUsd)}</strong>
						</div>
						<small>
							Cost {usdFormatter.format(portfolio.costBasisUsd)} · PnL{" "}
							{usdFormatter.format(portfolio.pnlUsd)} (
							{portfolio.pnlPct.toFixed(2)}%) · {portfolio.basketCount} baskets
						</small>
					</div>
				</section>
			) : null}

			{!loading && portfolio && !portfolio.baskets.length ? (
				<div className="empty-page">
					<HandCoins size={28} />
					<h2>No baskets yet</h2>
					<p>Invest on Stellar from Review to create your first personal bucket.</p>
				</div>
			) : null}

			<div className="positions-list">
				{portfolio?.baskets.map((basket) => (
					<article className="position-row" key={basket.id}>
						<div className="position-copy">
							<strong>
								{basket.name} · #{basket.bucketId}
							</strong>
							<small>
								{basket.allocations.map((a) => a.symbol).join(" · ")} ·{" "}
								{basket.sharesOutstanding} shares
							</small>
						</div>
						<div className="position-metrics">
							<span>{usdFormatter.format(basket.pnl.currentNavUsd)}</span>
							<small
								className={
									basket.pnl.pnlUsd >= 0 ? "pnl-up" : "pnl-down"
								}
							>
								{basket.pnl.pnlUsd >= 0 ? "+" : ""}
								{usdFormatter.format(basket.pnl.pnlUsd)} (
								{basket.pnl.pnlPct.toFixed(2)}%)
							</small>
						</div>
					</article>
				))}
			</div>
		</main>
	);
}
