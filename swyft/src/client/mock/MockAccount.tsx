import { Copy, LogOut, RefreshCw, Shield } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { OnboardingPreferences } from "../../domain/schemas";
import { StableTokenLabel } from "../components/StableTokenLabel";
import {
	getWalletPortfolio,
	type WalletPortfolioPayload,
} from "../stellar/portfolio-api";
import { shortStellarAddress } from "../stellar/kit";
import type { SwyftUser } from "../user-storage";
import { buildDemoPortfolio } from "./mock-portfolio-fixtures";

const usd = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 2,
});

const joinedFmt = new Intl.DateTimeFormat("en-US", {
	month: "short",
	year: "numeric",
});

export function MockAccount({
	wallet,
	user,
	username,
	preferences,
	onResetPlan,
	onDisconnect,
	onOpenPortfolio,
}: {
	wallet: string;
	user?: SwyftUser;
	username?: string;
	preferences: OnboardingPreferences;
	onResetPlan: () => void;
	onDisconnect: () => void;
	onOpenPortfolio?: () => void;
}) {
	const handle = username ?? user?.username ?? "trader";
	const [portfolio, setPortfolio] = useState<WalletPortfolioPayload>();
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		let cancelled = false;
		const applyDemo = () => {
			if (!cancelled) setPortfolio(buildDemoPortfolio(wallet || "demo"));
		};
		if (!wallet) {
			applyDemo();
			return () => {
				cancelled = true;
			};
		}
		void getWalletPortfolio(wallet)
			.then((data) => {
				if (cancelled) return;
				setPortfolio(data.baskets.length ? data : buildDemoPortfolio(wallet));
			})
			.catch(applyDemo);
		return () => {
			cancelled = true;
		};
	}, [wallet]);

	const monogram = useMemo(() => {
		const parts = handle.replace(/[@_]/g, " ").trim().split(/\s+/);
		const a = parts[0]?.[0] ?? "S";
		const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "W";
		return `${a}${b}`.toUpperCase();
	}, [handle]);

	const riskLabel =
		preferences.riskMode === "conservative"
			? "Conservative"
			: preferences.riskMode === "aggressive"
				? "Aggressive"
				: "Balanced";

	const joinedLabel = user?.createdAt
		? `Joined ${joinedFmt.format(new Date(user.createdAt))}`
		: "Active trader";

	const baskets = portfolio?.baskets ?? [];
	const nav = portfolio?.currentNavUsd ?? 0;
	const pnlUsd = portfolio?.pnlUsd ?? 0;
	const pnlPct = portfolio?.pnlPct ?? 0;
	const pnlUp = pnlUsd >= 0;

	async function copyWallet() {
		try {
			await navigator.clipboard.writeText(wallet);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {
			setCopied(false);
		}
	}

	return (
		<main className="account-page trader-profile-page">
			<header className="trader-profile-hero">
				<div className="trader-avatar" aria-hidden="true">
					{monogram}
				</div>
				<div className="trader-profile-intro">
					<span className="eyebrow">Trader profile</span>
					<h1>@{handle}</h1>
					<p>
						Non-custodial Stellar trader · {riskLabel.toLowerCase()} risk ·{" "}
						{joinedLabel.toLowerCase()}
					</p>
					<div className="trader-identity-row">
						<span className="trader-chip">{joinedLabel}</span>
						<span className="trader-chip">Stellar</span>
						<span className="trader-chip">{riskLabel}</span>
						<button
							type="button"
							className="trader-chip trader-chip-button"
							onClick={() => void copyWallet()}
							title={wallet}
						>
							{shortStellarAddress(wallet)}
							<Copy size={12} strokeWidth={2.4} aria-hidden="true" />
							{copied ? "Copied" : null}
						</button>
					</div>
				</div>
			</header>

			<section className="trader-stat-grid" aria-label="Trader stats">
				<div className="trader-stat">
					<small>Portfolio</small>
					<strong>{usd.format(nav)}</strong>
					<em>
						<StableTokenLabel token="USDC" /> marked
					</em>
				</div>
				<div className="trader-stat">
					<small>PnL</small>
					<strong className={pnlUp ? "pnl-up" : "pnl-down"}>
						{pnlUp ? "+" : ""}
						{usd.format(pnlUsd)}
					</strong>
					<em className={pnlUp ? "pnl-up" : "pnl-down"}>
						{pnlUp ? "+" : ""}
						{pnlPct.toFixed(2)}%
					</em>
				</div>
				<div className="trader-stat">
					<small>Baskets</small>
					<strong>{baskets.length}</strong>
					<em>Active positions</em>
				</div>
				<div className="trader-stat">
					<small>Ticket</small>
					<strong>${preferences.ticketSizeUsd}</strong>
					<em>
						/ ${preferences.periodLimitUsd}{" "}
						<StableTokenLabel token="USDC" />
					</em>
				</div>
			</section>

			<section className="trader-panel">
				<div className="trader-panel-head">
					<h2>Trading style</h2>
					<span className="trader-chip">{preferences.cadence}</span>
				</div>
				<ul className="trader-style-tags">
					<li>{riskLabel} risk</li>
					{preferences.assetClasses.map((assetClass) => (
						<li key={assetClass}>
							{assetClass === "STOCK_TOKEN" ? "RWA stocks" : "Crypto"}
						</li>
					))}
					<li>
						${preferences.ticketSizeUsd} tickets
					</li>
					<li>
						${preferences.periodLimitUsd} period cap
					</li>
				</ul>
				<p className="trader-panel-note">
					<Shield size={14} strokeWidth={2.2} aria-hidden="true" />
					You approve every basket from your wallet. Swyft never holds funds.
				</p>
			</section>

			<section className="trader-panel">
				<div className="trader-panel-head">
					<h2>Open baskets</h2>
					{onOpenPortfolio ? (
						<button
							type="button"
							className="trader-link-button"
							onClick={onOpenPortfolio}
						>
							View portfolio
						</button>
					) : null}
				</div>
				{baskets.length ? (
					<ul className="trader-basket-list">
						{baskets.slice(0, 4).map((basket) => (
							<li key={basket.id}>
								<div>
									<strong>{basket.name}</strong>
									<small>
										{basket.allocations.length} assets ·{" "}
										{usd.format(basket.pnl.currentNavUsd)}
									</small>
								</div>
								<span
									className={
										basket.pnl.pnlUsd >= 0 ? "pnl-up" : "pnl-down"
									}
								>
									{basket.pnl.pnlUsd >= 0 ? "+" : ""}
									{basket.pnl.pnlPct.toFixed(1)}%
								</span>
							</li>
						))}
					</ul>
				) : (
					<p className="trader-panel-empty">No open baskets yet.</p>
				)}
			</section>

			<section className="trader-actions">
				<button
					type="button"
					className="button button-outline"
					onClick={onResetPlan}
				>
					<RefreshCw size={16} strokeWidth={2.2} aria-hidden="true" />
					Rebuild plan
				</button>
				<button
					type="button"
					className="button button-primary"
					onClick={onDisconnect}
				>
					<LogOut size={16} strokeWidth={2.2} aria-hidden="true" />
					Log out
				</button>
			</section>
		</main>
	);
}
