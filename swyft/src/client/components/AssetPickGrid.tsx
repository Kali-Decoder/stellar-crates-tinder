import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import type { Candidate } from "../../domain/schemas";
import { formatUsdPrice } from "../price-format";
import {
	lookupRwaAsset,
	type RwaAssetType,
} from "../stellar/dia-api";
import { AssetMark } from "./AssetMark";

const FX_REGION: Record<string, string> = {
	EUR: "Europe",
	JPY: "Japan",
	CAD: "Canada",
	AUD: "Australia",
	CNY: "China",
	GBP: "United Kingdom",
	CHF: "Switzerland",
	KRW: "South Korea",
	INR: "India",
	BRL: "Brazil",
	MXN: "Mexico",
};

const ETF_VENUE: Record<string, string> = {
	SPY: "NYSE Arca",
	QQQ: "Nasdaq",
	VOO: "NYSE Arca",
	IVV: "NYSE Arca",
	TLT: "Nasdaq",
	IBIT: "Nasdaq",
	GOVT: "Nasdaq",
	EEM: "NYSE Arca",
};

const CATEGORY_ORDER: RwaAssetType[] = ["Stock", "ETF", "Commodity", "FX"];

const CATEGORY_LABEL: Record<RwaAssetType, string> = {
	Stock: "Stocks",
	ETF: "ETFs",
	Commodity: "Commodities",
	FX: "FX",
};

/** Map candidate tags → filter category (catalog type wins when present). */
function categoryForCandidate(candidate: Candidate): RwaAssetType | "Other" {
	const fromCatalog = lookupRwaAsset(candidate.symbol)?.type;
	if (fromCatalog) return fromCatalog;

	const tags = new Set((candidate.tags ?? []).map((tag) => tag.toLowerCase()));
	if (tags.has("stock") || tags.has("stocks")) return "Stock";
	if (tags.has("etf") || tags.has("etfs")) return "ETF";
	if (tags.has("commodity") || tags.has("commodities")) return "Commodity";
	if (tags.has("fx") || tags.has("fiat")) return "FX";
	if (candidate.kind === "CRYPTO" || tags.has("crypto")) return "Other";
	return "Other";
}

function metaForCandidate(candidate: Candidate): {
	typeLabel: string;
	contextLabel: string;
	contextValue: string;
	rwaType?: RwaAssetType;
	tags: string[];
} {
	const category = categoryForCandidate(candidate);
	const type = category === "Other" ? undefined : category;
	const candidateTags = candidate.tags ?? [];
	const displayTags = [
		...(type ? [CATEGORY_LABEL[type]] : []),
		...candidateTags.filter(
			(tag) =>
				![
					"stellar",
					"rwa",
					"stock",
					"etf",
					"commodity",
					"fx",
					"crypto",
				].includes(tag.toLowerCase()),
		),
	].slice(0, 3);

	if (type === "Commodity") {
		return {
			typeLabel: "Commodity",
			contextLabel: "Exchange",
			contextValue: "Commodity",
			rwaType: type,
			tags: displayTags.length ? displayTags : ["Commodity"],
		};
	}
	if (type === "FX") {
		return {
			typeLabel: "FX rate",
			contextLabel: "Region",
			contextValue: FX_REGION[candidate.symbol.toUpperCase()] ?? "Global",
			rwaType: type,
			tags: displayTags.length ? displayTags : ["FX"],
		};
	}
	if (type === "ETF") {
		return {
			typeLabel: "ETF",
			contextLabel: "Exchange",
			contextValue: ETF_VENUE[candidate.symbol.toUpperCase()] ?? "US",
			rwaType: type,
			tags: displayTags.length ? displayTags : ["ETF"],
		};
	}
	if (type === "Stock") {
		return {
			typeLabel: "Stock",
			contextLabel: "Exchange",
			contextValue: "US equities",
			rwaType: type,
			tags: displayTags.length ? displayTags : ["Stock"],
		};
	}
	return {
		typeLabel: candidate.kind === "CRYPTO" ? "Crypto" : "RWA",
		contextLabel: "Exchange",
		contextValue: "Stellar",
		tags: displayTags.length
			? displayTags
			: [candidate.kind === "CRYPTO" ? "Crypto" : "RWA"],
	};
}

type FilterId = "all" | RwaAssetType | "Other";

export function AssetPickGrid({
	candidates,
	selectedIds,
	ticketSizeUsd,
	canAddMore,
	onToggle,
}: {
	candidates: Candidate[];
	selectedIds: string[];
	ticketSizeUsd: number;
	canAddMore: boolean;
	onToggle: (assetId: string, nextSelected: boolean) => void;
}) {
	const [filter, setFilter] = useState<FilterId>("all");
	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

	const categoryCounts = useMemo(() => {
		const counts = new Map<FilterId, number>();
		for (const candidate of candidates) {
			const category = categoryForCandidate(candidate);
			counts.set(category, (counts.get(category) ?? 0) + 1);
		}
		return counts;
	}, [candidates]);

	const filterChips = useMemo(() => {
		const chips: { id: FilterId; label: string; count: number }[] = [
			{ id: "all", label: "All", count: candidates.length },
		];
		for (const category of CATEGORY_ORDER) {
			const count = categoryCounts.get(category) ?? 0;
			if (!count) continue;
			chips.push({
				id: category,
				label: CATEGORY_LABEL[category],
				count,
			});
		}
		const other = categoryCounts.get("Other") ?? 0;
		if (other) {
			chips.push({ id: "Other", label: "Other", count: other });
		}
		return chips;
	}, [candidates.length, categoryCounts]);

	const visible = useMemo(() => {
		if (filter === "all") return candidates;
		return candidates.filter(
			(candidate) => categoryForCandidate(candidate) === filter,
		);
	}, [candidates, filter]);

	if (!candidates.length) {
		return (
			<div className="asset-pick-empty">
				<p>No assets in this feed yet.</p>
			</div>
		);
	}

	return (
		<div className="asset-pick-panel">
			<div
				className="asset-pick-filters"
				role="tablist"
				aria-label="Filter by category"
			>
				{filterChips.map((chip) => (
					<button
						key={chip.id}
						type="button"
						role="tab"
						aria-selected={filter === chip.id}
						className={`asset-pick-filter${filter === chip.id ? " is-active" : ""}`}
						onClick={() => setFilter(chip.id)}
					>
						{chip.label}
						<span>{chip.count}</span>
					</button>
				))}
			</div>

			{!visible.length ? (
				<div className="asset-pick-empty">
					<p>No assets in this category.</p>
				</div>
			) : (
				<ul className="asset-pick-grid" aria-label="Select assets for your basket">
					{visible.map((candidate) => {
						const selected = selectedSet.has(candidate.assetId);
						const blocked = !selected && !canAddMore;
						const meta = metaForCandidate(candidate);
						const price =
							candidate.marketPriceUsd ??
							Number(candidate.quote?.unitPriceUsd ?? 0);
						return (
							<li key={candidate.assetId}>
								<button
									type="button"
									className={`asset-pick-card${selected ? " is-selected" : ""}${blocked ? " is-blocked" : ""}`}
									aria-pressed={selected}
									disabled={blocked}
									onClick={() => onToggle(candidate.assetId, !selected)}
								>
									<div className="asset-pick-top">
										<AssetMark
											symbol={candidate.symbol}
											iconUrl={candidate.iconUrl}
											size="md"
										/>
										<div className="asset-pick-identity">
											<strong title={candidate.name}>{candidate.name}</strong>
											<div className="asset-pick-tags" aria-label="Tags">
												{meta.tags.map((tag) => (
													<span key={tag} className="asset-pick-tag">
														{tag}
													</span>
												))}
											</div>
										</div>
										<span className="asset-pick-ticker">{candidate.symbol}</span>
										{selected ? (
											<span className="asset-pick-check" aria-hidden="true">
												<Check size={14} strokeWidth={3} />
											</span>
										) : null}
									</div>

									<div className="asset-pick-price">
										<small>Asset price</small>
										<strong>
											{price > 0 ? formatUsdPrice(price) : "—"}
										</strong>
									</div>

									<div className="asset-pick-meta">
										<div>
											<small>{meta.contextLabel}</small>
											<span>{meta.contextValue}</span>
										</div>
										<div>
											<small>Type</small>
											<span>{meta.typeLabel}</span>
										</div>
									</div>

									{selected ? (
										<span className="asset-pick-ticket">
											+{ticketSizeUsd} USDC
										</span>
									) : null}
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
