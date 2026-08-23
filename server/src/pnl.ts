export type AllocationMark = {
	symbol: string;
	targetBps: number;
	priceAtDepositUsd: number;
	priceNowUsd: number;
	weight: number;
	legNavUsd: number;
	legPnlUsd: number;
	legPnlPct: number;
};

export type BasketPnl = {
	costBasisUsd: number;
	currentNavUsd: number;
	pnlUsd: number;
	pnlPct: number;
	marks: AllocationMark[];
	method: "weighted_spot_mtm";
	note: string;
};

/**
 * Single-owner basket mark-to-market (no rebalance assumed):
 * each target sleeve is treated as notional exposure costBasis * bps/10000,
 * marked by spot_now / spot_at_deposit.
 */
export function computeBasketPnl(
	basket: {
		costBasisUsd: number;
		allocations: Array<{
			symbol: string;
			targetBps: number;
			priceAtDepositUsd: number;
			asset?: string;
			diaKey?: string;
		}>;
	},
	spotBySymbol: Record<string, number>,
): BasketPnl {
	const cost = Math.max(0, basket.costBasisUsd);
	const marks: AllocationMark[] = [];
	let currentNavUsd = 0;

	for (const leg of basket.allocations) {
		const weight = leg.targetBps / 10_000;
		const entry = leg.priceAtDepositUsd > 0 ? leg.priceAtDepositUsd : 1;
		const now = spotBySymbol[leg.symbol.toUpperCase()] ?? entry;
		const legCost = cost * weight;
		const legNav = legCost * (now / entry);
		const legPnl = legNav - legCost;
		marks.push({
			symbol: leg.symbol.toUpperCase(),
			targetBps: leg.targetBps,
			priceAtDepositUsd: entry,
			priceNowUsd: now,
			weight,
			legNavUsd: round2(legNav),
			legPnlUsd: round2(legPnl),
			legPnlPct: entry > 0 ? ((now - entry) / entry) * 100 : 0,
		});
		currentNavUsd += legNav;
	}

	if (!marks.length) {
		currentNavUsd = cost;
	}

	const pnlUsd = currentNavUsd - cost;
	return {
		costBasisUsd: round2(cost),
		currentNavUsd: round2(currentNavUsd),
		pnlUsd: round2(pnlUsd),
		pnlPct: cost > 0 ? (pnlUsd / cost) * 100 : 0,
		marks,
		method: "weighted_spot_mtm",
		note:
			"Single-owner basket: cost basis marked by target weights × DIA spot change. After on-chain rebalance, prefer vault portfolio_value.",
	};
}

function round2(n: number) {
	return Math.round(n * 100) / 100;
}
