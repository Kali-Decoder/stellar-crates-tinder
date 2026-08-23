/** Momentum signal from chart prices — demo UX, not investment advice. */

export type AnalyzeLabel = "Buy" | "Hold" | "Skip";

export type AnalyzeFactors = {
	/** Period return strength 0–100. */
	momentum: number;
	/** Early→late half trend 0–100. */
	trend: number;
	/** Inverse volatility 0–100 (higher = calmer). */
	stability: number;
};

export type AnalyzeSignal = {
	/** 0–100 buy lean (higher = more constructive on this timeframe). */
	score: number;
	label: AnalyzeLabel;
	detail: string;
	periodReturnPct: number;
	halfTrendPct: number;
	volatilityPct: number;
	factors: AnalyzeFactors;
	/** Short commentary lines for the UI. */
	comments: string[];
	/** Normalized 0–1 path for the mini analyze sparkline. */
	spark: number[];
};

export function analyzePriceSeries(prices: number[]): AnalyzeSignal | null {
	if (prices.length < 4) return null;
	const first = prices[0];
	const last = prices.at(-1);
	if (!first || !last || first <= 0 || last <= 0) return null;

	const periodReturnPct = ((last - first) / first) * 100;

	const mid = Math.floor(prices.length / 2);
	const early = avg(prices.slice(0, mid));
	const late = avg(prices.slice(mid));
	const halfTrendPct = early > 0 ? ((late - early) / early) * 100 : 0;

	const returns: number[] = [];
	for (let i = 1; i < prices.length; i++) {
		const prev = prices[i - 1];
		const next = prices[i];
		if (prev && next && prev > 0) returns.push((next - prev) / prev);
	}
	const volatilityPct = stdev(returns) * 100;
	const volPenalty = Math.min(18, volatilityPct * 2.2);

	let score =
		50 +
		clamp(periodReturnPct * 3.2, -28, 28) +
		clamp(halfTrendPct * 2.4, -16, 16) -
		volPenalty;
	score = Math.round(clamp(score, 8, 94));

	const factors: AnalyzeFactors = {
		momentum: Math.round(clamp(50 + periodReturnPct * 4.5, 5, 98)),
		trend: Math.round(clamp(50 + halfTrendPct * 5, 5, 98)),
		stability: Math.round(clamp(92 - volatilityPct * 12, 8, 97)),
	};

	let label: AnalyzeLabel;
	let detail: string;
	if (score >= 62) {
		label = "Buy";
		detail =
			periodReturnPct >= 0
				? "Constructive lean on this timeframe"
				: "Recovering after earlier weakness";
	} else if (score <= 38) {
		label = "Skip";
		detail =
			periodReturnPct < 0
				? "Soft lean — pressure still shows"
				: "Too noisy relative to the trend";
	} else {
		label = "Hold";
		detail = "Mixed lean — wait for a clearer move";
	}

	const comments = buildComments({
		label,
		score,
		periodReturnPct,
		halfTrendPct,
		volatilityPct,
		factors,
	});

	return {
		score,
		label,
		detail,
		periodReturnPct,
		halfTrendPct,
		volatilityPct,
		factors,
		comments,
		spark: normalizeSpark(prices),
	};
}

function buildComments(input: {
	label: AnalyzeLabel;
	score: number;
	periodReturnPct: number;
	halfTrendPct: number;
	volatilityPct: number;
	factors: AnalyzeFactors;
}): string[] {
	const {
		label,
		score,
		periodReturnPct,
		halfTrendPct,
		volatilityPct,
		factors,
	} = input;
	const comments: string[] = [];

	const retAbs = Math.abs(periodReturnPct);
	if (periodReturnPct >= 2) {
		comments.push(
			`Price is up ${periodReturnPct.toFixed(1)}% on this window — buyers have the edge.`,
		);
	} else if (periodReturnPct <= -2) {
		comments.push(
			`Price is down ${retAbs.toFixed(1)}% here — sellers still in control.`,
		);
	} else {
		comments.push(
			`Near flat (${periodReturnPct >= 0 ? "+" : ""}${periodReturnPct.toFixed(1)}%) — no strong directional punch yet.`,
		);
	}

	if (halfTrendPct >= 1.2) {
		comments.push("Second half of the chart is stronger than the first.");
	} else if (halfTrendPct <= -1.2) {
		comments.push("Second half weakened vs the first — momentum fading.");
	} else {
		comments.push("Early and late halves look similar — trend is neutral.");
	}

	if (volatilityPct >= 1.8) {
		comments.push(
			`Choppy tape (vol ~${volatilityPct.toFixed(1)}%) — size carefully if you add.`,
		);
	} else if (factors.stability >= 70) {
		comments.push("Path is relatively steady — cleaner read than average.");
	} else {
		comments.push("Moderate noise — signal is usable but not ironclad.");
	}

	if (label === "Buy") {
		comments.push(
			`Lean: add bias at ${score}% — aligns with a constructive basket pick.`,
		);
	} else if (label === "Skip") {
		comments.push(
			`Lean: skip bias at ${score}% — prefer waiting or another name.`,
		);
	} else {
		comments.push(
			`Lean: hold at ${score}% — fine to watch, not urgent to chase.`,
		);
	}

	return comments.slice(0, 4);
}

function normalizeSpark(prices: number[]): number[] {
	const min = Math.min(...prices);
	const max = Math.max(...prices);
	const span = max - min || 1;
	const step = Math.max(1, Math.floor(prices.length / 24));
	const out: number[] = [];
	for (let i = 0; i < prices.length; i += step) {
		const p = prices[i] ?? min;
		out.push((p - min) / span);
	}
	const last = prices.at(-1) ?? min;
	if (out.length === 0 || prices[prices.length - 1] !== prices[(out.length - 1) * step]) {
		out.push((last - min) / span);
	}
	return out.slice(0, 28);
}

function avg(values: number[]) {
	if (!values.length) return 0;
	return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function stdev(values: number[]) {
	if (values.length < 2) return 0;
	const mean = avg(values);
	const variance =
		values.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (values.length - 1);
	return Math.sqrt(variance);
}

function clamp(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, n));
}
