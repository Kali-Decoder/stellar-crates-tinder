import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import type { Candidate } from "../../domain/schemas";
import { formatTicketSizeUsd } from "../../domain/schemas";
import type {
	ExecutionRecord,
	FeedResponse,
	WeeklySession,
} from "../api";
import { api } from "../api";
import { AssetMark } from "../components/AssetMark";
import { ArrowRight, Check, Close, Shield } from "../components/Icons";

export function MockReview({
	session,
	feed,
	selected,
	onRemove,
	onBack,
	onSettled,
	onExecutionChange,
	ticketSizeUsd,
	periodLimitUsd,
	wallet,
	activeChain,
}: {
	session: WeeklySession;
	feed: FeedResponse;
	selected: Candidate[];
	onRemove: (assetId: string) => void;
	onBack: () => void;
	onSettled: (record: ExecutionRecord) => void;
	onExecutionChange: (record: ExecutionRecord) => void;
	ticketSizeUsd: number;
	periodLimitUsd: number;
	wallet: string;
	activeChain: "ROBINHOOD" | "SOLANA";
}) {
	const [record, setRecord] = useState<ExecutionRecord>();
	const [loading, setLoading] = useState(true);
	const [phase, setPhase] = useState<"refreshing" | "signing" | "idle">(
		"refreshing",
	);
	const [error, setError] = useState("");
	const [walletBalance, setWalletBalance] = useState<number>();
	const [now, setNow] = useState(() => Date.now());
	const total = Math.round(selected.length * ticketSizeUsd * 100) / 100;
	const stableToken = "USDC";

	const prepare = useCallback(async () => {
		if (!selected.length) {
			setError("Choose at least one asset before refreshing quotes.");
			return;
		}
		setLoading(true);
		setPhase("refreshing");
		setError("");
		try {
			const prepared = await api.prepareExecution(
				session.id,
				selected.map((item) => item.assetId),
				ticketSizeUsd,
				periodLimitUsd,
				activeChain,
			);
			setRecord(prepared);
			onExecutionChange(prepared);
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "Could not prepare basket",
			);
		} finally {
			setLoading(false);
			setPhase("idle");
		}
	}, [
		activeChain,
		onExecutionChange,
		periodLimitUsd,
		selected,
		session.id,
		ticketSizeUsd,
	]);

	useEffect(() => {
		void prepare();
	}, [prepare]);

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1_000);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		let cancelled = false;
		void api
			.solanaBalance(wallet)
			.then(({ usdcBalanceBaseUnits, usdcDecimals }) => {
				if (!cancelled) {
					setWalletBalance(
						Number(formatUnits(BigInt(usdcBalanceBaseUnits), usdcDecimals)),
					);
				}
			})
			.catch(() => {
				if (!cancelled) setWalletBalance(undefined);
			});
		return () => {
			cancelled = true;
		};
	}, [wallet]);

	const quoteExpiry = useMemo(() => {
		const quotes = record?.plan.quotes ?? [];
		if (!quotes.length) return 0;
		return Math.max(
			0,
			Math.min(...quotes.map((quote) => new Date(quote.expiresAt).getTime())) -
				now,
		);
	}, [now, record]);

	async function confirmMock() {
		if (!record) return;
		setLoading(true);
		setPhase("signing");
		setError("");
		try {
			const settled = await api.demoSettle(record.plan.executionId);
			setRecord(settled);
			onExecutionChange(settled);
			onSettled(settled);
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "Mock settlement failed",
			);
		} finally {
			setLoading(false);
			setPhase("idle");
		}
	}

	if (loading && phase === "refreshing") {
		return (
			<main className="loading-state review-preparing" aria-live="polite">
				<span />
				<h1>Preparing your basket…</h1>
			</main>
		);
	}

	const quoteByAssetId = new Map(
		(record?.plan.quotes ?? []).map((quote) => [quote.assetId, quote]),
	);

	return (
		<main className="review-page">
			<section className="review-ledger">
				<header>
					<h1>Review your basket</h1>
					<p>Mock quotes are ready for a simulated confirmation.</p>
					{error ? (
						<p className="review-error" role="alert">
							{error}
						</p>
					) : null}
				</header>
				<ul className="review-assets">
					{selected.map((candidate) => {
						const quote = quoteByAssetId.get(candidate.assetId) ?? candidate.quote;
						return (
							<li key={candidate.assetId}>
								<div className="review-asset-main">
									<AssetMark
										symbol={candidate.symbol}
										iconUrl={candidate.iconUrl}
									/>
									<div>
										<b>{candidate.name}</b>
										<small>{candidate.symbol}</small>
									</div>
									<button
										type="button"
										className="icon-button"
										aria-label={`Remove ${candidate.symbol}`}
										onClick={() => onRemove(candidate.assetId)}
									>
										<Close />
									</button>
								</div>
								<dl>
									<div>
										<dt>In</dt>
										<dd>
											{formatTicketSizeUsd(ticketSizeUsd)} {stableToken}
										</dd>
									</div>
									<div>
										<dt>Est. out</dt>
										<dd>
											{quote
												? formatUnits(
														BigInt(quote.estimatedAmountOut),
														candidate.decimals ?? 18,
													)
												: "—"}
										</dd>
									</div>
									<div>
										<dt>Impact</dt>
										<dd>
											{quote
												? `${(quote.priceImpactBps / 100).toFixed(2)}%`
												: "—"}
										</dd>
									</div>
								</dl>
							</li>
						);
					})}
				</ul>
			</section>

			<aside className="review-summary">
				<header>
					<h2>Confirm allocation</h2>
					<p>
						Wallet {walletBalance !== undefined
							? `${walletBalance.toFixed(2)} ${stableToken}`
							: "…"}{" "}
						· Quote {Math.ceil(quoteExpiry / 1000)}s
					</p>
				</header>
				<dl>
					<div>
						<dt>Spend</dt>
						<dd>
							{formatTicketSizeUsd(total)} {stableToken}
						</dd>
					</div>
					<div>
						<dt>Remaining budget</dt>
						<dd>
							{formatTicketSizeUsd(periodLimitUsd - total)} {stableToken}
						</dd>
					</div>
					<div>
						<dt>Ranking</dt>
						<dd>{feed.proof.effectiveProvider ?? "DETERMINISTIC"}</dd>
					</div>
				</dl>
				<div className="demo-disclosure">
					Stellar preview: trading and settlement are simulated in this UI flow.
					No onchain broadcast until live execution is enabled.
				</div>
				<div className="review-actions">
					<button type="button" className="button button-outline" onClick={onBack}>
						Back
					</button>
					<button
						type="button"
						className="button button-outline"
						onClick={() => void prepare()}
						disabled={loading}
					>
						Refresh quotes
					</button>
					<button
						type="button"
						className="button button-primary"
						onClick={() => void confirmMock()}
						disabled={!record || loading || quoteExpiry <= 0}
					>
						{phase === "signing" ? (
							<>
								<LoaderCircle className="spin" /> Settling…
							</>
						) : (
							<>
								Confirm & invest {formatTicketSizeUsd(total)} {stableToken}{" "}
								<Check />
							</>
						)}
					</button>
				</div>
				<p className="review-policy">
					<Shield /> Policy + plan hash checked locally against fixture quotes.{" "}
					<ArrowRight />
				</p>
			</aside>
		</main>
	);
}
