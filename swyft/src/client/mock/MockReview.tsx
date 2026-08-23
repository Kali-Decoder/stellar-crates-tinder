import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { StableTokenLabel } from "../components/StableTokenLabel";
import { explorerTxUrl, stellarConfig, USDC_DECIMALS } from "../stellar/config";
import {
	buildAllocationsFromSymbols,
	investBasket,
	readUsdcBalance,
	usdToUsdcBaseUnits,
} from "../stellar/vault";
import { hasStellarToken } from "../stellar/config";
import { recordStellarBasket } from "../stellar/portfolio-api";
import { claimTestnetDemoUsd } from "../stellar/faucet";
import { shortStellarAddress } from "../stellar/kit";

export function MockReview({
	session,
	feed: _feed,
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
	const [statusLine, setStatusLine] = useState("");
	const [error, setError] = useState("");
	const [walletBalance, setWalletBalance] = useState<number>();
	const [faucetBusy, setFaucetBusy] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	const total = Math.round(selected.length * ticketSizeUsd * 100) / 100;
	const stableToken = "USDC";
	const assetIdsKey = selected.map((item) => item.assetId).join("|");
	const selectedRef = useRef(selected);
	selectedRef.current = selected;
	const onExecutionChangeRef = useRef(onExecutionChange);
	onExecutionChangeRef.current = onExecutionChange;
	const prepareAttempt = useRef(0);

	const onchainSymbols = useMemo(
		() => selected.map((c) => c.symbol).filter(hasStellarToken),
		[selected],
	);
	const missingOnchain = selected.filter((c) => !hasStellarToken(c.symbol));
	const canGoOnchain = onchainSymbols.length > 0;

	const prepare = useCallback(async () => {
		const currentSelected = selectedRef.current;
		if (!currentSelected.length) {
			setError("Choose at least one asset before refreshing quotes.");
			setLoading(false);
			setPhase("idle");
			return;
		}
		const attempt = ++prepareAttempt.current;
		setLoading(true);
		setPhase("refreshing");
		setError("");
		try {
			const prepared = await api.prepareExecution(
				session.id,
				currentSelected.map((item) => item.assetId),
				ticketSizeUsd,
				periodLimitUsd,
				activeChain,
			);
			if (attempt !== prepareAttempt.current) return;
			setRecord(prepared);
			onExecutionChangeRef.current(prepared);
		} catch (caught) {
			if (attempt !== prepareAttempt.current) return;
			const raw =
				caught instanceof Error ? caught.message : "Could not prepare basket";
			setError(
				raw === "SESSION_NOT_FOUND"
					? "This basket session expired. Tap Refresh quotes, or go back and open a new basket."
					: raw,
			);
		} finally {
			if (attempt === prepareAttempt.current) {
				setLoading(false);
				setPhase("idle");
			}
		}
	}, [activeChain, assetIdsKey, periodLimitUsd, session.id, ticketSizeUsd]);

	useEffect(() => {
		void prepare();
		return () => {
			prepareAttempt.current += 1;
		};
	}, [prepare]);

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1_000);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		let cancelled = false;
		void readUsdcBalance(wallet)
			.then((base) => {
				if (!cancelled) {
					setWalletBalance(Number(base) / 10 ** USDC_DECIMALS);
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

	async function confirmOnchain() {
		if (!record || !wallet) return;
		setLoading(true);
		setPhase("signing");
		setError("");
		setStatusLine("Preparing Stellar transactions…");
		try {
			buildAllocationsFromSymbols(onchainSymbols);
			const needed = usdToUsdcBaseUnits(total);
			const balance = await readUsdcBalance(wallet);
			if (balance < needed) {
				throw new Error(
					`Need ${total.toFixed(2)} USDC on testnet (wallet has ${(Number(balance) / 10 ** USDC_DECIMALS).toFixed(2)}). Use Get testnet USDC on Profile, or the button below.`,
				);
			}

			const result = await investBasket({
				source: wallet,
				name: `Swyft ${onchainSymbols.slice(0, 3).join("-")} ${new Date().toISOString().slice(0, 10)}`,
				symbols: onchainSymbols,
				usdAmount: total,
				onPhase: setStatusLine,
			});

			try {
				await recordStellarBasket({
					ownerWallet: wallet,
					bucketId: result.bucketId,
					name: `Swyft ${onchainSymbols.slice(0, 3).join("-")}`,
					allocations: buildAllocationsFromSymbols(onchainSymbols),
					depositUsd: total,
					shares: result.shares,
					createTxHash: result.createHash,
					approveTxHash: result.approveHash,
					depositTxHash: result.depositHash,
				});
			} catch (persistError) {
				console.warn("Basket portfolio persist failed", persistError);
			}

			const settled: ExecutionRecord = {
				...record,
				status: "SETTLED",
				transactionHashes: [
					result.createHash,
					result.approveHash,
					result.depositHash,
				],
				settledAt: new Date().toISOString(),
				settledOutputs: selected.map((candidate) => ({
					assetId: candidate.assetId,
					amountOutBaseUnits: candidate.quote?.estimatedAmountOut ?? "0",
					transactionHash: result.depositHash,
					status: "success" as const,
				})),
			};
			setRecord(settled);
			onExecutionChange(settled);
			onSettled(settled);
			setStatusLine(
				`Bucket #${result.bucketId} · ${result.shares} shares minted`,
			);
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "On-chain invest failed",
			);
		} finally {
			setLoading(false);
			setPhase("idle");
		}
	}

	async function claimFaucet() {
		if (!wallet || faucetBusy) return;
		setFaucetBusy(true);
		setError("");
		try {
			await claimTestnetDemoUsd({
				wallet,
				amountUsd: Math.max(1000, total * 2),
				onPhase: setStatusLine,
			});
			const balance = await readUsdcBalance(wallet);
			setWalletBalance(Number(balance) / 10 ** USDC_DECIMALS);
			setStatusLine("USDC minted — try Invest on Stellar again.");
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Faucet failed — Freighter on Testnet + npm run dev:stack",
			);
		} finally {
			setFaucetBusy(false);
		}
	}

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
					<p>
						Confirm to create a Stellar bucket and deposit{" "}
						<StableTokenLabel token="USDC" /> into the vault.
					</p>
					{error ? (
						<p className="review-error" role="alert">
							{error}
						</p>
					) : null}
					{error?.includes("USDC") ||
					error?.includes("DEMOUSD") ||
					(walletBalance !== undefined && walletBalance < total) ? (
						<button
							type="button"
							className="button button-outline review-faucet-button"
							disabled={!wallet || faucetBusy || loading}
							onClick={() => void claimFaucet()}
						>
							{faucetBusy ? "Minting USDC…" : "Get testnet USDC"}
						</button>
					) : null}
					{statusLine && phase !== "refreshing" ? (
						<p className="review-status" aria-live="polite">
							{statusLine}
						</p>
					) : null}
				</header>
				<ul className="review-assets">
					{selected.map((candidate) => {
						const quote = quoteByAssetId.get(candidate.assetId) ?? candidate.quote;
						const live = hasStellarToken(candidate.symbol);
						return (
							<li key={candidate.assetId}>
								<div className="review-asset-main">
									<AssetMark
										symbol={candidate.symbol}
										iconUrl={candidate.iconUrl}
									/>
									<div>
										<b>{candidate.name}</b>
										<small>
											{candidate.symbol}
											{live ? " · Stellar" : " · not on vault"}
										</small>
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
											{formatTicketSizeUsd(ticketSizeUsd)}{" "}
											<StableTokenLabel token={stableToken} />
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
						Wallet{" "}
						{walletBalance !== undefined ? (
							<>
								{walletBalance.toFixed(2)}{" "}
								<StableTokenLabel token={stableToken} />
							</>
						) : (
							"…"
						)}{" "}
						· Quote {Math.ceil(quoteExpiry / 1000)}s
					</p>
				</header>
				<dl>
					<div>
						<dt>Spend</dt>
						<dd>
							{formatTicketSizeUsd(total)}{" "}
							<StableTokenLabel token={stableToken} />
						</dd>
					</div>
					<div>
						<dt>On-chain assets</dt>
						<dd>
							{onchainSymbols.length}/{selected.length}
						</dd>
					</div>
					<div>
						<dt>Remaining budget</dt>
						<dd>
							{formatTicketSizeUsd(periodLimitUsd - total)}{" "}
							<StableTokenLabel token={stableToken} />
						</dd>
					</div>
				</dl>
				{missingOnchain.length ? (
					<div className="demo-disclosure">
						Skipped on-chain (no token deployed):{" "}
						{missingOnchain.map((c) => c.symbol).join(", ")}. Equal weight
						across {onchainSymbols.join(", ") || "—"}.
					</div>
				) : (
					<div className="live-disclosure">
						Live Stellar testnet: create_bucket → approve USDC → deposit into
						vault {shortStellarAddress(stellarConfig.vault)}. You will sign 3
						Freighter prompts.
					</div>
				)}
				{record?.transactionHashes?.length ? (
					<div className="live-disclosure">
						{record.transactionHashes.map((hash) => (
							<div key={hash}>
								<a href={explorerTxUrl(hash)} target="_blank" rel="noreferrer">
									View tx {hash.slice(0, 8)}…
								</a>
							</div>
						))}
					</div>
				) : null}
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
						onClick={() => void confirmOnchain()}
						disabled={!record || loading || quoteExpiry <= 0 || !canGoOnchain}
					>
						{phase === "signing" ? (
							<>
								<LoaderCircle className="spin" /> {statusLine || "Signing…"}
							</>
						) : (
							<>
								Invest on Stellar {formatTicketSizeUsd(total)}{" "}
								<StableTokenLabel token={stableToken} /> <Check />
							</>
						)}
					</button>
					<button
						type="button"
						className="button button-quiet"
						onClick={() => void confirmMock()}
						disabled={!record || loading}
					>
						Simulate only
					</button>
				</div>
				<p className="review-policy">
					<Shield /> Vault mints share tokens; prices from DIA oracle.{" "}
					<ArrowRight />
				</p>
			</aside>
		</main>
	);
}
