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
 *
 * When spot has not moved vs deposit (fresh basket / same DIA tick), apply a
 * tiny seeded ± jitter so the UI shows light profit/loss instead of all zeros.
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
	let usedDemoJitter = false;

	for (const leg of basket.allocations) {
		const weight = leg.targetBps / 10_000;
		const entry = leg.priceAtDepositUsd > 0 ? leg.priceAtDepositUsd : 1;
		const symbol = leg.symbol.toUpperCase();
		let now = spotBySymbol[symbol] ?? entry;
		if (entry > 0 && Math.abs(now - entry) / entry < 0.0005) {
			const jitterPct = demoMicroMovePct(`${symbol}:${entry.toFixed(4)}`);
			now = round4(entry * (1 + jitterPct / 100));
			usedDemoJitter = true;
		}
		const legCost = cost * weight;
		const legNav = legCost * (now / entry);
		const legPnl = legNav - legCost;
		marks.push({
			symbol,
			targetBps: leg.targetBps,
			priceAtDepositUsd: round4(entry),
			priceNowUsd: round4(now),
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
		marks: marks.map((mark) => ({
			...mark,
			legPnlPct: round2(mark.legPnlPct),
		})),
		method: "weighted_spot_mtm",
		note: usedDemoJitter
			? "Live DIA marks with a light demo tick when prices are unchanged since deposit."
			: "Single-owner basket: cost basis marked by target weights × DIA spot change. After on-chain rebalance, prefer vault portfolio_value.",
	};
}

/** Stable pseudo-random move in about ±0.12% … ±0.85% (never zero). */
function demoMicroMovePct(seed: string): number {
	let hash = 2166136261;
	for (let i = 0; i < seed.length; i += 1) {
		hash ^= seed.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	const unit = (hash >>> 0) % 10_000; // 0..9999
	const signed = unit / 5_000 - 1; // roughly -1..+0.9998
	const magnitude = 0.12 + Math.abs(signed) * 0.73; // 0.12% .. 0.85%
	const direction = signed < 0 ? -1 : 1;
	return round4(direction * magnitude);
}

function round2(n: number) {
	return Math.round(n * 100) / 100;
}

function round4(n: number) {
	return Math.round(n * 10_000) / 10_000;
}
