import {
	BriefcaseBusiness,
	ChevronDown,
	ExternalLink,
	FileText,
	LoaderCircle,
	RotateCcw,
	SlidersHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import type { Candidate } from "../../domain/schemas";
import type { ExecutionRecord, FeedResponse } from "../api";
import { AssetMark } from "./AssetMark";
import { Confetti } from "./magicui/confetti";
import { Check, Shield } from "./Icons";
import { StableTokenLabel } from "./StableTokenLabel";

export function ReceiptScreen({
	record,
	selected,
	feed,
	demoMode,
	onResume,
	onViewPortfolio,
	onStartNextBasket,
}: {
	record?: ExecutionRecord;
	selected: Candidate[];
	feed?: FeedResponse;
	demoMode: boolean;
	onResume: () => Promise<void>;
	onViewPortfolio: () => void;
	onStartNextBasket: () => void;
}) {
	const showConfetti = useSettlementConfetti(record);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [detailsOpen, setDetailsOpen] = useState(false);

	useEffect(() => {
		setExpandedId(selected[0]?.assetId ?? null);
	}, [record?.plan.executionId, selected]);

	if (!record) {
		return (
			<main className="receipt-page activity-page">
				<header className="receipt-heading activity-heading">
					<div>
						<span className="eyebrow">Activity</span>
						<h1>No settlements yet</h1>
						<p>
							Terminal receipts appear here after you invest in a basket.
							Quotes alone never count as settled.
						</p>
					</div>
				</header>
				<section className="activity-empty-card">
					<p>Build a basket, then settle from Review to see activity here.</p>
					<button
						type="button"
						className="button button-primary"
						onClick={onStartNextBasket}
					>
						New basket
					</button>
				</section>
			</main>
		);
	}

	const isTerminal = ["SETTLED", "PARTIAL", "FAILED"].includes(record.status);
	const successfulLegs = record.settledOutputs.filter(
		(output) => output.status === "success",
	).length;
	const isStellarTx = record.transactionHashes.some((hash) =>
		/^[a-fA-F0-9]{64}$/.test(hash),
	);
	const chainLabel =
		demoMode || isStellarTx
			? "Stellar"
			: record.plan.chain === "SOLANA"
				? "Solana"
				: "Robinhood Chain";
	const providerLabel = executionProviderLabel(record.plan.provider);
	const receiptStatus = receiptCopy(
		record.status,
		selected.length,
		successfulLegs,
		chainLabel,
		providerLabel,
		record.submissionMode,
	);
	const outputsByAssetId = new Map(
		record.settledOutputs.map((output) => [output.assetId, output]),
	);
	const transactionHash = record.transactionHashes.at(-1);
	const isPending = record.status === "SUBMITTED";
	const isSettled = record.status === "SETTLED";
	const stableToken =
		demoMode || isStellarTx || record.plan.chain === "SOLANA" ? "USDC" : "USDG";
	const totalInput = formatUsd(
		formatUnits(BigInt(record.plan.totalInputBaseUnits), 6),
	);
	const settledDescription = `${totalInput} was split across ${successfulLegs} ${successfulLegs === 1 ? "asset" : "assets"} and added to your portfolio.`;
	const receiptTitle = isSettled ? "Basket settled" : receiptStatus.title;
	const receiptDescription = isSettled
		? settledDescription
		: receiptStatus.description;
	const transactionUrl = transactionHash
		? explorerUrl(transactionHash, record.plan.chain)
		: undefined;

	return (
		<main className="receipt-page activity-page">
			{showConfetti ? (
				<Confetti
					className="receipt-confetti"
					options={{
						colors: ["#baff00", "#111111", "#ffffff"],
						gravity: 0.9,
						particleCount: 120,
						spread: 92,
						startVelocity: 38,
					}}
				/>
			) : null}

			<header className="receipt-heading activity-heading" aria-live="polite">
				<span
					className={`receipt-check ${isPending ? "pending" : record.status === "FAILED" ? "failed" : ""}`}
				>
					{isPending ? (
						<LoaderCircle />
					) : record.status === "FAILED" ? (
						<span aria-hidden="true">!</span>
					) : (
						<Check />
					)}
				</span>
				<div>
					<span className="eyebrow">Activity</span>
					<h1>{receiptTitle}</h1>
					<p>{receiptDescription}</p>
				</div>
			</header>

			<section className="activity-summary" aria-label="Settlement summary">
				<div className="activity-stat">
					<small>Spent</small>
					<strong>
						{totalInput} <StableTokenLabel token={stableToken} />
					</strong>
				</div>
				<div className="activity-stat">
					<small>Assets</small>
					<strong>{selected.length || record.plan.quotes.length}</strong>
				</div>
				<div className="activity-stat">
					<small>Status</small>
					<strong
						className={
							isSettled ? "pnl-up" : record.status === "FAILED" ? "pnl-down" : ""
						}
					>
						{record.status}
					</strong>
				</div>
				<div className="activity-stat">
					<small>Network</small>
					<strong>{chainLabel}</strong>
				</div>
			</section>

			<section className="activity-ledger">
				<div className="activity-ledger-head">
					<h2>What you bought</h2>
					<span className="activity-tag">{providerLabel}</span>
					<span className="activity-tag">{chainLabel}</span>
				</div>

				{!selected.length ? (
					<p className="receipt-missing-snapshot">
						The operation is preserved, but its local card snapshot is
						unavailable. Open the transaction receipt for the canonical onchain
						details.
					</p>
				) : null}

				<div className="activity-asset-list" role="list">
					{selected.map((candidate) => {
						const output = outputsByAssetId.get(candidate.assetId);
						const isSuccess = output?.status === "success";
						const quote =
							candidate.quote ??
							record.plan.quotes.find(
								(candidateQuote) =>
									candidateQuote.assetId === candidate.assetId,
							);
						const fullOutput =
							isSuccess && output
								? formatUnits(
										BigInt(output.amountOutBaseUnits),
										candidate.decimals,
									)
								: undefined;
						const open = expandedId === candidate.assetId;
						const statusLabel = isSuccess
							? "Received"
							: output?.status === "failed"
								? "Failed"
								: isTerminal
									? "Missing"
									: "Pending";

						return (
							<article
								key={candidate.assetId}
								className={`activity-asset-card${open ? " is-open" : ""}`}
								role="listitem"
							>
								<button
									type="button"
									className="activity-asset-toggle"
									aria-expanded={open}
									onClick={() =>
										setExpandedId((current) =>
											current === candidate.assetId ? null : candidate.assetId,
										)
									}
								>
									<div className="activity-asset-main">
										<AssetMark
											symbol={candidate.symbol}
											iconUrl={candidate.iconUrl}
											size="md"
										/>
										<div>
											<strong>{candidate.symbol}</strong>
											<small>{candidate.name}</small>
										</div>
									</div>
									<div className="activity-asset-side">
										<span
											className={`activity-status-tag status-${statusLabel.toLowerCase()}`}
										>
											{statusLabel}
										</span>
										{quote ? (
											<span className="activity-amount-tag">
												{formatUsd(
													formatUnits(BigInt(quote.amountInBaseUnits), 6),
												)}
											</span>
										) : null}
										<ChevronDown
											className="activity-chevron"
											size={18}
											strokeWidth={2.4}
											aria-hidden="true"
										/>
									</div>
								</button>

								{open ? (
									<div className="activity-asset-detail">
										<div className="activity-detail-row">
											<span>Allocation</span>
											<strong>
												{quote
													? formatUsd(
															formatUnits(BigInt(quote.amountInBaseUnits), 6),
														)
													: "—"}{" "}
												<StableTokenLabel token={stableToken} />
											</strong>
										</div>
										<div className="activity-detail-row">
											<span>Received</span>
											<strong>
												{fullOutput
													? `${formatTokenAmount(fullOutput)} ${candidate.symbol}`
													: "—"}
											</strong>
										</div>
										{quote?.unitPriceUsd ? (
											<div className="activity-detail-row">
												<span>Unit price</span>
												<strong>
													{formatUsd(String(quote.unitPriceUsd))}
												</strong>
											</div>
										) : null}
										{output?.transactionHash ? (
											<div className="activity-detail-row">
												<span>Tx</span>
												<code>{shortHash(output.transactionHash)}</code>
											</div>
										) : null}
									</div>
								) : null}
							</article>
						);
					})}
				</div>

				<div
					className={`receipt-verification ${isPending ? "pending" : record.status === "FAILED" ? "failed" : ""}`}
				>
					{isPending ? <LoaderCircle /> : <Check />}
					<b>
						{isSettled
							? `Verified on ${chainLabel}`
							: `${record.status.toLowerCase()} on ${chainLabel}`}
					</b>
				</div>
				{record.settledAt ? (
					<p className="receipt-captured-at">
						Settled {formatSettledAt(record.settledAt)}
					</p>
				) : null}
			</section>

			<section className="activity-technical">
				<button
					type="button"
					className={`activity-tech-toggle${detailsOpen ? " is-open" : ""}`}
					aria-expanded={detailsOpen}
					onClick={() => setDetailsOpen((value) => !value)}
				>
					<span className="receipt-detail-icon">
						<SlidersHorizontal aria-hidden="true" />
					</span>
					<span>
						<b>How this was executed</b>
						<small>
							One {providerLabel} transaction · {record.plan.quotes.length}{" "}
							swaps
						</small>
					</span>
					<ChevronDown aria-hidden="true" />
				</button>

				{detailsOpen ? (
					<div className="receipt-proof activity-proof">
						<p>
							<Shield />
							<span>
								Execution provider<b>{providerLabel}</b>
							</span>
						</p>
						<p>
							<Shield />
							<span>
								Authorized plan
								<b>{shortHash(record.plan.authorizedPlanHash)}</b>
							</span>
						</p>
						<p>
							<Shield />
							<span>
								Policy hash<b>{shortHash(record.plan.policyHash)}</b>
							</span>
						</p>
						<p>
							<Shield />
							<span>
								Ranking output
								<b>
									{feed
										? shortHash(feed.proof.outputCommitment)
										: "Feed snapshot unavailable"}
								</b>
							</span>
						</p>
						{feed?.proof.teeVerified ? (
							<div className="receipt-proof-links">
								<a
									href={zeroGProviderUrl(feed.proof.provider)}
									target="_blank"
									rel="noreferrer"
								>
									View TEE provider on 0G Explorer ↗
								</a>
								<a
									href="https://0g.ai/product"
									target="_blank"
									rel="noreferrer"
								>
									About 0G private inference ↗
								</a>
							</div>
						) : null}
						<div className="live-disclosure">
							{record.submissionMode === "BATCH"
								? `Settlement is verified from the atomic ${chainLabel} operation and output-token transfers to your Swyft Wallet.`
								: `Settlement is verified per ${chainLabel} transaction and output-token transfer to your Swyft Wallet.`}
						</div>
					</div>
				) : null}

				<div className="receipt-transaction-row activity-tx-row">
					<span className="receipt-detail-icon">
						<FileText aria-hidden="true" />
					</span>
					<span>
						<b>Transaction receipt</b>
						<small>
							{transactionHash
								? shortHash(transactionHash)
								: "Awaiting operation hash"}
						</small>
					</span>
					{transactionUrl ? (
						<a
							href={transactionUrl}
							target="_blank"
							rel="noreferrer"
							aria-label={`View transaction on ${chainLabel}`}
						>
							<ExternalLink aria-hidden="true" />
						</a>
					) : (
						<span className="activity-tag">{chainLabel}</span>
					)}
				</div>
			</section>

			<div className="receipt-actions">
				{isPending ? (
					<button
						type="button"
						className="button button-primary"
						onClick={() => void onResume()}
					>
						<RotateCcw aria-hidden="true" /> Check settlement
					</button>
				) : successfulLegs > 0 ? (
					<button
						type="button"
						className="button button-primary"
						onClick={onViewPortfolio}
					>
						See my portfolio <BriefcaseBusiness aria-hidden="true" />
					</button>
				) : null}
				<button
					type="button"
					className="button button-quiet"
					onClick={onStartNextBasket}
				>
					Build another basket
				</button>
			</div>
		</main>
	);
}

function useSettlementConfetti(record?: ExecutionRecord) {
	const [showConfetti, setShowConfetti] = useState(false);
	const shownExecution = useRef<string | undefined>(undefined);

	useEffect(() => {
		if (record?.status !== "SETTLED") return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const executionId = record.plan.executionId;
		if (shownExecution.current !== executionId) {
			const storageKey = `investmade:settlement-confetti:${executionId}`;
			try {
				if (sessionStorage.getItem(storageKey)) return;
				sessionStorage.setItem(storageKey, "shown");
			} catch {
				// A blocked session store should not prevent the celebration.
			}
			shownExecution.current = executionId;
		}
		setShowConfetti(true);
		const timer = window.setTimeout(() => setShowConfetti(false), 2600);
		return () => window.clearTimeout(timer);
	}, [record?.plan.executionId, record?.status]);

	return showConfetti;
}

function executionProviderLabel(provider: ExecutionRecord["plan"]["provider"]) {
	if (provider === "ZERO_EX") return "0x";
	if (provider === "JUPITER") return "Jupiter";
	return "Uniswap";
}

function formatUsd(value: string) {
	const amount = Number(value);
	if (!Number.isFinite(amount)) return `$${value}`;
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount);
}

function formatTokenAmount(value: string) {
	const amount = Number(value);
	if (!Number.isFinite(amount)) return value;
	if (amount >= 1000) return amount.toFixed(2);
	if (amount >= 1) return amount.toFixed(4);
	return amount.toPrecision(4);
}

function shortHash(value: string) {
	if (value.length <= 14) return value;
	return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatSettledAt(iso: string) {
	try {
		return new Intl.DateTimeFormat("en-US", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(iso));
	} catch {
		return iso;
	}
}

function explorerUrl(hash: string, chain: ExecutionRecord["plan"]["chain"]) {
	if (/^[a-fA-F0-9]{64}$/.test(hash)) {
		return `https://stellar.expert/explorer/testnet/tx/${hash}`;
	}
	if (chain === "SOLANA") {
		return `https://solscan.io/tx/${hash}`;
	}
	return `https://explorer.robinhood.com/tx/${hash}`;
}

function zeroGProviderUrl(provider: string) {
	return `https://explorer.0g.ai/address/${provider}`;
}

function receiptCopy(
	status: ExecutionRecord["status"],
	selectedCount: number,
	successfulLegs: number,
	chainLabel: string,
	providerLabel: string,
	submissionMode: ExecutionRecord["submissionMode"],
) {
	if (status === "SETTLED") {
		return {
			title: "Basket settled",
			description: `Settled on ${chainLabel} via ${providerLabel}.`,
		};
	}
	if (status === "PARTIAL") {
		return {
			title: "Partially settled",
			description: `${successfulLegs} of ${selectedCount} legs settled.`,
		};
	}
	if (status === "FAILED") {
		return {
			title: "Settlement failed",
			description: "Nothing was added to your portfolio from this attempt.",
		};
	}
	if (status === "SUBMITTED") {
		return {
			title: "Waiting on chain",
			description:
				submissionMode === "BATCH"
					? "Your batch transaction is still confirming."
					: "Your transactions are still confirming.",
		};
	}
	return {
		title: "Preparing settlement",
		description: "Quotes are ready. Confirm when you are ready to invest.",
	};
}
