import {
	BriefcaseBusiness,
	ChevronDown,
	ExternalLink,
	FileText,
	LoaderCircle,
	RotateCcw,
	ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import type { Candidate } from "../../domain/schemas";
import type { ExecutionRecord, FeedResponse } from "../api";
import { AssetMark } from "./AssetMark";
import { Confetti } from "./magicui/confetti";
import { Check } from "./Icons";
import { StableTokenLabel } from "./StableTokenLabel";

const STELLAR_HASH = /^[a-fA-F0-9]{64}$/;

export function ReceiptScreen({
	record,
	selected,
	feed: _feed,
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
				<header className="activity-hero">
					<span className="eyebrow">Activity</span>
					<h1>No settlements yet</h1>
					<p>
						Invest from Review to mint vault shares. Receipts and Stellar
						transaction links show up here.
					</p>
				</header>
				<section className="activity-empty-card">
					<p>
						Swipe a basket, confirm on Freighter, then return here for the
						settlement receipt.
					</p>
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

	const isStellarTx = record.transactionHashes.some((hash) =>
		STELLAR_HASH.test(hash),
	);
	const isStellar = demoMode || isStellarTx;
	const inputDecimals = isStellar ? 6 : 6;
	const isTerminal = ["SETTLED", "PARTIAL", "FAILED"].includes(record.status);
	const successfulLegs = record.settledOutputs.filter(
		(output) => output.status === "success",
	).length;
	const chainLabel = isStellar
		? "Stellar"
		: record.plan.chain === "SOLANA"
			? "Solana"
			: "Robinhood Chain";
	const providerLabel = isStellar
		? "bucket-vault"
		: executionProviderLabel(record.plan.provider);
	const receiptStatus = receiptCopy(
		record.status,
		selected.length,
		successfulLegs,
		chainLabel,
		providerLabel,
		record.submissionMode,
		isStellar,
	);
	const outputsByAssetId = new Map(
		record.settledOutputs.map((output) => [output.assetId, output]),
	);
	const isPending = record.status === "SUBMITTED";
	const isSettled = record.status === "SETTLED";
	const isFailed = record.status === "FAILED";
	const stableToken =
		isStellar || record.plan.chain === "SOLANA" ? "USDC" : "USDG";
	const totalInput = formatUsd(
		formatUnits(BigInt(record.plan.totalInputBaseUnits), inputDecimals),
	);
	const settledDescription = isStellar
		? `${totalInput} USDC deposited into your personal vault bucket across ${successfulLegs} ${successfulLegs === 1 ? "asset" : "assets"}.`
		: `${totalInput} was split across ${successfulLegs} ${successfulLegs === 1 ? "asset" : "assets"} and added to your portfolio.`;
	const receiptTitle = isSettled
		? isStellar
			? "Basket on Stellar"
			: "Basket settled"
		: receiptStatus.title;
	const receiptDescription = isSettled
		? settledDescription
		: receiptStatus.description;

	const stellarSteps = isStellar
		? labelStellarHashes(record.transactionHashes)
		: [];
	const fallbackHash = record.transactionHashes.at(-1);

	return (
		<main className="receipt-page activity-page">
			{showConfetti ? (
				<Confetti
					className="receipt-confetti"
					options={{
						colors: ["#2fd4a8", "#071018", "#ffffff"],
						gravity: 0.9,
						particleCount: 100,
						spread: 88,
						startVelocity: 34,
					}}
				/>
			) : null}

			<header className="activity-hero" aria-live="polite">
				<div className="activity-hero-top">
					<span
						className={`activity-status-orb${isPending ? " is-pending" : ""}${isFailed ? " is-failed" : ""}${isSettled ? " is-ok" : ""}`}
						aria-hidden="true"
					>
						{isPending ? (
							<LoaderCircle />
						) : isFailed ? (
							"!"
						) : (
							<Check />
						)}
					</span>
					<div>
						<span className="eyebrow">Activity</span>
						<h1>{receiptTitle}</h1>
						<p>{receiptDescription}</p>
					</div>
				</div>
				<div className="activity-hero-tags">
					<span className="activity-tag">{chainLabel}</span>
					<span className="activity-tag">{providerLabel}</span>
					<span
						className={`activity-tag activity-status-chip status-${record.status.toLowerCase()}`}
					>
						{record.status}
					</span>
				</div>
			</header>

			<section className="activity-summary" aria-label="Settlement summary">
				<div className="activity-stat">
					<small>Deposited</small>
					<strong>
						{totalInput} <StableTokenLabel token={stableToken} />
					</strong>
				</div>
				<div className="activity-stat">
					<small>Assets</small>
					<strong>{selected.length || record.plan.quotes.length}</strong>
				</div>
				<div className="activity-stat">
					<small>Network</small>
					<strong>{chainLabel}</strong>
				</div>
				<div className="activity-stat">
					<small>{isStellar ? "Vault" : "Provider"}</small>
					<strong>{providerLabel}</strong>
				</div>
			</section>

			<section className="activity-ledger">
				<div className="activity-ledger-head">
					<h2>{isStellar ? "Basket allocations" : "What you bought"}</h2>
					{isStellar ? (
						<span className="activity-tag">Equal weight</span>
					) : (
						<span className="activity-tag">{providerLabel}</span>
					)}
				</div>

				{!selected.length ? (
					<p className="receipt-missing-snapshot">
						Local asset cards are unavailable. Open the transaction receipt for
						on-chain details.
					</p>
				) : null}

				<ul className="activity-asset-list">
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
							? isStellar
								? "Allocated"
								: "Received"
							: output?.status === "failed"
								? "Failed"
								: isTerminal
									? "Missing"
									: "Pending";

						return (
							<li
								key={candidate.assetId}
								className={`activity-asset-card${open ? " is-open" : ""}`}
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
													formatUnits(
														BigInt(quote.amountInBaseUnits),
														inputDecimals,
													),
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
											<span>Ticket</span>
											<strong>
												{quote
													? formatUsd(
															formatUnits(
																BigInt(quote.amountInBaseUnits),
																inputDecimals,
															),
														)
													: "—"}{" "}
												<StableTokenLabel token={stableToken} />
											</strong>
										</div>
										<div className="activity-detail-row">
											<span>{isStellar ? "Target" : "Received"}</span>
											<strong>
												{fullOutput
													? `${formatTokenAmount(fullOutput)} ${candidate.symbol}`
													: isStellar
														? "Vault shares (basket)"
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
												{STELLAR_HASH.test(output.transactionHash) ? (
													<a
														href={explorerUrl(
															output.transactionHash,
															record.plan.chain,
														)}
														target="_blank"
														rel="noreferrer"
													>
														{shortHash(output.transactionHash)}
													</a>
												) : (
													<code>{shortHash(output.transactionHash)}</code>
												)}
											</div>
										) : null}
									</div>
								) : null}
							</li>
						);
					})}
				</ul>

				<div
					className={`activity-verify-banner${isPending ? " is-pending" : ""}${isFailed ? " is-failed" : ""}`}
				>
					{isPending ? <LoaderCircle size={18} /> : <ShieldCheck size={18} />}
					<div>
						<strong>
							{isSettled
								? isStellar
									? "Verified on Stellar testnet"
									: `Verified on ${chainLabel}`
								: `${record.status.toLowerCase()} on ${chainLabel}`}
						</strong>
						{record.settledAt ? (
							<small>Settled {formatSettledAt(record.settledAt)}</small>
						) : null}
					</div>
				</div>
			</section>

			<section className="activity-technical">
				<button
					type="button"
					className={`activity-tech-toggle${detailsOpen ? " is-open" : ""}`}
					aria-expanded={detailsOpen}
					onClick={() => setDetailsOpen((value) => !value)}
				>
					<span className="receipt-detail-icon">
						<FileText aria-hidden="true" />
					</span>
					<span>
						<b>{isStellar ? "On-chain steps" : "How this was executed"}</b>
						<small>
							{isStellar
								? `${Math.max(stellarSteps.length, 1)} Freighter transaction${stellarSteps.length === 1 ? "" : "s"}`
								: `One ${providerLabel} transaction · ${record.plan.quotes.length} swaps`}
						</small>
					</span>
					<ChevronDown aria-hidden="true" />
				</button>

				{detailsOpen ? (
					<div className="activity-proof">
						{isStellar ? (
							<ul className="activity-step-list">
								{(stellarSteps.length
									? stellarSteps
									: [
											{
												label: "Settlement",
												hash: fallbackHash,
											},
										]
								).map((step) => (
									<li key={`${step.label}-${step.hash ?? "pending"}`}>
										<div>
											<strong>{step.label}</strong>
											<small>
												{step.hash ? shortHash(step.hash) : "Pending"}
											</small>
										</div>
										{step.hash && STELLAR_HASH.test(step.hash) ? (
											<a
												href={explorerUrl(step.hash, record.plan.chain)}
												target="_blank"
												rel="noreferrer"
												aria-label={`View ${step.label} on Stellar Expert`}
											>
												<ExternalLink size={18} aria-hidden="true" />
											</a>
										) : null}
									</li>
								))}
							</ul>
						) : (
							<>
								<p>
									<span>
										Execution provider
										<b>{providerLabel}</b>
									</span>
								</p>
								<p>
									<span>
										Authorized plan
										<b>{shortHash(record.plan.authorizedPlanHash)}</b>
									</span>
								</p>
								{fallbackHash ? (
									<p>
										<span>
											Transaction
											<b>{shortHash(fallbackHash)}</b>
										</span>
									</p>
								) : null}
							</>
						)}
						<p className="activity-proof-note">
							{isStellar
								? "You signed create_bucket → approve USDC → deposit. Shares stay in your Freighter wallet."
								: `Settlement is verified from the ${chainLabel} operation and transfers to your wallet.`}
						</p>
					</div>
				) : null}

				{!isStellar && fallbackHash ? (
					<div className="receipt-transaction-row activity-tx-row">
						<span className="receipt-detail-icon">
							<FileText aria-hidden="true" />
						</span>
						<span>
							<b>Transaction receipt</b>
							<small>{shortHash(fallbackHash)}</small>
						</span>
						<a
							href={explorerUrl(fallbackHash, record.plan.chain)}
							target="_blank"
							rel="noreferrer"
							aria-label={`View transaction on ${chainLabel}`}
						>
							<ExternalLink aria-hidden="true" />
						</a>
					</div>
				) : null}
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
					className="button button-outline"
					onClick={onStartNextBasket}
				>
					Build another basket
				</button>
			</div>
		</main>
	);
}

function labelStellarHashes(hashes: string[]) {
	const labels =
		hashes.length >= 3
			? ["Create bucket", "Approve USDC", "Deposit"]
			: hashes.length === 2
				? ["Approve USDC", "Deposit"]
				: ["Deposit"];
	return hashes.map((hash, index) => ({
		label: labels[index] ?? `Transaction ${index + 1}`,
		hash,
	}));
}

function useSettlementConfetti(record?: ExecutionRecord) {
	const [showConfetti, setShowConfetti] = useState(false);
	const shownExecution = useRef<string | undefined>(undefined);

	useEffect(() => {
		if (record?.status !== "SETTLED") return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const executionId = record.plan.executionId;
		if (shownExecution.current !== executionId) {
			const storageKey = `swyft:settlement-confetti:${executionId}`;
			try {
				if (sessionStorage.getItem(storageKey)) return;
				sessionStorage.setItem(storageKey, "shown");
			} catch {
				// ignore
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
	if (STELLAR_HASH.test(hash)) {
		return `https://stellar.expert/explorer/testnet/tx/${hash}`;
	}
	if (chain === "SOLANA") {
		return `https://solscan.io/tx/${hash}`;
	}
	return `https://explorer.robinhood.com/tx/${hash}`;
}

function receiptCopy(
	status: ExecutionRecord["status"],
	selectedCount: number,
	successfulLegs: number,
	chainLabel: string,
	providerLabel: string,
	submissionMode: ExecutionRecord["submissionMode"],
	isStellar: boolean,
) {
	if (status === "SETTLED") {
		return {
			title: isStellar ? "Basket on Stellar" : "Basket settled",
			description: isStellar
				? "Vault shares minted after Freighter approvals."
				: `Settled on ${chainLabel} via ${providerLabel}.`,
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
