import type {
	AppChain,
	Candidate,
	ExecutionProviderId,
} from "../../domain/schemas";
import { formatTicketSizeUsd } from "../../domain/schemas";
import { AssetMark } from "./AssetMark";
import { Close } from "./Icons";

export function BudgetSummary({
	selectedCount,
	ticketSizeUsd,
	periodLimitUsd,
	activeChain,
	stableToken,
	className = "",
}: {
	selectedCount: number;
	ticketSizeUsd: number;
	periodLimitUsd: number;
	activeChain: AppChain;
	stableToken?: "USDC" | "USDG";
	className?: string;
}) {
	const remaining = Math.max(
		0,
		Math.round((periodLimitUsd - selectedCount * ticketSizeUsd) * 100) / 100,
	);
	const remainingPercent =
		periodLimitUsd > 0 ? (remaining / periodLimitUsd) * 100 : 0;
	const usedPercent = Math.max(0, Math.min(100, 100 - remainingPercent));
	const token = stableToken ?? (activeChain === "SOLANA" ? "USDC" : "USDG");

	return (
		<div className={`rail-budget${className ? ` ${className}` : ""}`}>
			<div className="rail-budget-copy">
				<span className="rail-budget-label">This period</span>
				<span className="rail-budget-value">
					<strong>{formatTicketSizeUsd(remaining)}</strong> {token} left
				</span>
			</div>
			<span
				className="rail-budget-progress"
				role="progressbar"
				aria-label="Monthly budget left"
				aria-valuemin={0}
				aria-valuemax={periodLimitUsd}
				aria-valuenow={remaining}
			>
				<i style={{ width: `${remainingPercent}%` }} />
			</span>
			<span className="rail-budget-meta">
				{formatTicketSizeUsd(selectedCount * ticketSizeUsd)} of{" "}
				{formatTicketSizeUsd(periodLimitUsd)} allocated · {usedPercent.toFixed(0)}%
			</span>
		</div>
	);
}

export function BudgetRail({
	selected,
	onRemove,
	ticketSizeUsd,
	periodLimitUsd,
	executionProvider,
	activeChain,
	stableToken,
	networkLabel,
	quoteLabel,
	sheetOpen = false,
	onSheetOpenChange,
	onReview,
}: {
	selected: Candidate[];
	onRemove: (assetId: string) => void;
	ticketSizeUsd: number;
	periodLimitUsd: number;
	executionProvider: ExecutionProviderId;
	activeChain: AppChain;
	stableToken?: "USDC" | "USDG";
	networkLabel?: string;
	quoteLabel?: string;
	sheetOpen?: boolean;
	onSheetOpenChange?: (open: boolean) => void;
	onReview?: () => void;
}) {
	const token = stableToken ?? (activeChain === "SOLANA" ? "USDC" : "USDG");
	const network =
		networkLabel ?? (activeChain === "SOLANA" ? "Solana" : "Robinhood");
	const quotes =
		quoteLabel ??
		(executionProvider === "ZERO_EX"
			? "0x"
			: executionProvider === "JUPITER"
				? "Jupiter"
				: "Uniswap");
	const total = formatTicketSizeUsd(selected.length * ticketSizeUsd);
	const sheet = typeof onSheetOpenChange === "function";

	return (
		<>
			{sheet ? (
				<button
					type="button"
					className={`basket-fab${selected.length ? " has-items" : ""}${sheetOpen ? " is-open" : ""}`}
					onClick={() => onSheetOpenChange?.(!sheetOpen)}
					aria-expanded={sheetOpen}
					aria-controls="basket-panel"
				>
					<span className="basket-fab-count" aria-hidden={!selected.length}>
						{selected.length || 0}
					</span>
					<span className="basket-fab-label">
						{selected.length ? (
							<>
								Basket · <strong>{total}</strong> {token}
							</>
						) : (
							"Basket empty"
						)}
					</span>
				</button>
			) : null}

			{sheet && sheetOpen ? (
				<button
					type="button"
					className="basket-sheet-backdrop"
					aria-label="Close basket"
					onClick={() => onSheetOpenChange?.(false)}
				/>
			) : null}

			<aside
				id="basket-panel"
				className={`budget-rail${sheet ? " budget-rail-sheet" : ""}${sheetOpen ? " is-open" : ""}`}
				aria-label="Basket and providers"
				aria-hidden={sheet ? !sheetOpen : undefined}
			>
				{sheet ? (
					<div className="basket-sheet-handle" aria-hidden="true">
						<span />
					</div>
				) : null}

				<BudgetSummary
					selectedCount={selected.length}
					ticketSizeUsd={ticketSizeUsd}
					periodLimitUsd={periodLimitUsd}
					activeChain={activeChain}
					stableToken={token}
				/>

				<div className="budget-meta">
					<span className="quote-provider">
						<span className="status-dot status-dot-quote" aria-hidden="true" />
						Quotes · {quotes}
					</span>
					<span className="network-line">
						<span className="status-dot status-dot-chain" aria-hidden="true" />
						Chain · {network}
					</span>
				</div>

				<div className="basket-panel">
					<div className="basket-head">
						<h3>Your basket</h3>
						<span>
							{selected.length
								? `${selected.length} asset${selected.length === 1 ? "" : "s"}`
								: "Empty"}
						</span>
					</div>

					{selected.length ? (
						<ul className="basket-list">
							{selected.map((candidate, index) => (
								<li
									className="basket-row"
									key={candidate.assetId}
									style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
								>
									<AssetMark
										symbol={candidate.symbol}
										iconUrl={candidate.iconUrl}
										size="sm"
									/>
									<div className="basket-main">
										<div className="basket-row-top">
											<strong className="basket-symbol">
												{candidate.symbol}
											</strong>
											<button
												type="button"
												className="basket-remove"
												onClick={() => onRemove(candidate.assetId)}
												aria-label={`Remove ${candidate.symbol}`}
											>
												<Close />
											</button>
										</div>
										<div className="basket-row-bottom">
											<small className="basket-asset-name">
												{candidate.name}
											</small>
											<span className="basket-amount">
												<strong>{formatTicketSizeUsd(ticketSizeUsd)}</strong>
												<small>{token}</small>
											</span>
										</div>
									</div>
								</li>
							))}
						</ul>
					) : (
						<div className="basket-empty">
							<p>Swipe right to add</p>
							<small>Assets you add land here before you invest.</small>
						</div>
					)}

					{selected.length && onReview ? (
						<button
							type="button"
							className="button button-primary basket-review-cta"
							onClick={() => {
								onSheetOpenChange?.(false);
								onReview();
							}}
						>
							Review basket ({selected.length}) · {total} {token}
						</button>
					) : null}
				</div>
			</aside>
		</>
	);
}
