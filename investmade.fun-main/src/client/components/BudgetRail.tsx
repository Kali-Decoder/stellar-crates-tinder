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
	const token = stableToken ?? (activeChain === "SOLANA" ? "USDC" : "USDG");

	return (
		<div className={`rail-budget${className ? ` ${className}` : ""}`}>
			<span>
				This month limit: <strong>{formatTicketSizeUsd(remaining)}</strong>{" "}
				{token} left
			</span>
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

	return (
		<aside className="budget-rail" aria-label="Basket and providers">
			<BudgetSummary
				selectedCount={selected.length}
				ticketSizeUsd={ticketSizeUsd}
				periodLimitUsd={periodLimitUsd}
				activeChain={activeChain}
				stableToken={token}
			/>
			<div className="budget-meta">
				<span className="quote-provider">
					Quotes execution: <i aria-hidden="true" /> {quotes}
				</span>
				<span className="network-line">
					Chain: <i aria-hidden="true" /> {network}
				</span>
			</div>
			{selected.length ? (
				<>
					<div className="basket-head">
						<h3>Your basket</h3>
						<span>{selected.length} assets</span>
					</div>
					<div className="basket-list">
						{selected.map((candidate) => (
							<div className="basket-row" key={candidate.assetId}>
								<AssetMark
									symbol={candidate.symbol}
									iconUrl={candidate.iconUrl}
									size="sm"
								/>
								<span className="basket-name">
									<strong>{candidate.symbol}</strong>
									<small>{candidate.name}</small>
								</span>
								<span className="basket-amount">
									<strong>{formatTicketSizeUsd(ticketSizeUsd)}</strong>
									<small>{token}</small>
								</span>
								<button
									type="button"
									onClick={() => onRemove(candidate.assetId)}
									aria-label={`Remove ${candidate.symbol}`}
								>
									<Close />
								</button>
							</div>
						))}
					</div>
				</>
			) : null}
		</aside>
	);
}
