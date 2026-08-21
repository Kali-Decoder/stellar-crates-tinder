export type LandingBasket = {
	id: string;
	title: string;
	subtitle: string;
	changePct: number;
	period: string;
	description: string;
	range: { high: number; midHigh: number; mid: number; low: number };
	dates: { start: string; end: string };
	/** Relative chart points 0–1 for SVG polyline */
	points: number[];
	holdings: { symbol: string; color: string; weight: number }[];
	icon: "mesh" | "bolt" | "orbit" | "leaf";
};

export const LANDING_BASKETS: LandingBasket[] = [
	{
		id: "ai-leaders",
		title: "AI Leaders",
		subtitle: "AI growth basket",
		changePct: 4.44,
		period: "1 Month",
		description:
			"Owns leading chip, cloud, and application companies in one basket.",
		range: { high: 1097, midHigh: 1045, mid: 993.47, low: 941.95 },
		dates: { start: "Jul 22", end: "Aug 21" },
		points: [0.22, 0.28, 0.25, 0.34, 0.31, 0.42, 0.48, 0.45, 0.58, 0.62, 0.71, 0.68, 0.78, 0.84, 0.8, 0.9],
		holdings: [
			{ symbol: "NVDA", color: "#76b900", weight: 28 },
			{ symbol: "MSFT", color: "#00a4ef", weight: 22 },
			{ symbol: "GOOGL", color: "#fbbc05", weight: 18 },
			{ symbol: "META", color: "#0668e1", weight: 17 },
			{ symbol: "AMZN", color: "#ff9900", weight: 15 },
		],
		icon: "mesh",
	},
	{
		id: "stellar-rwa",
		title: "Stellar RWAs",
		subtitle: "Tokenized markets",
		changePct: 2.18,
		period: "1 Month",
		description:
			"A swipe-ready mix of tokenized equities settling on Stellar.",
		range: { high: 412, midHigh: 398, mid: 381.2, low: 364 },
		dates: { start: "Jul 22", end: "Aug 21" },
		points: [0.4, 0.38, 0.45, 0.42, 0.5, 0.55, 0.52, 0.61, 0.58, 0.66, 0.7, 0.68, 0.74, 0.72, 0.8, 0.78],
		holdings: [
			{ symbol: "AAPL", color: "#a2aaad", weight: 24 },
			{ symbol: "TSLA", color: "#cc0000", weight: 22 },
			{ symbol: "NVDA", color: "#76b900", weight: 20 },
			{ symbol: "MSFT", color: "#00a4ef", weight: 18 },
			{ symbol: "GOOGL", color: "#4285f4", weight: 16 },
		],
		icon: "orbit",
	},
	{
		id: "crypto-core",
		title: "Crypto Core",
		subtitle: "Blue-chip onchain",
		changePct: -1.12,
		period: "1 Month",
		description:
			"Concentrated majors with room for a few high-conviction alts.",
		range: { high: 128.4, midHigh: 121.1, mid: 114.6, low: 108.2 },
		dates: { start: "Jul 22", end: "Aug 21" },
		points: [0.72, 0.68, 0.74, 0.62, 0.58, 0.65, 0.55, 0.5, 0.48, 0.42, 0.5, 0.45, 0.4, 0.38, 0.44, 0.41],
		holdings: [
			{ symbol: "BTC", color: "#f7931a", weight: 40 },
			{ symbol: "ETH", color: "#627eea", weight: 30 },
			{ symbol: "SOL", color: "#14f195", weight: 15 },
			{ symbol: "XLM", color: "#08b5e5", weight: 10 },
			{ symbol: "USDC", color: "#2775ca", weight: 5 },
		],
		icon: "bolt",
	},
	{
		id: "steady-yield",
		title: "Steady Yield",
		subtitle: "Balanced income",
		changePct: 1.05,
		period: "1 Month",
		description:
			"Defensive names and cash-like exposure for a calmer weekly ritual.",
		range: { high: 256, midHigh: 251, mid: 246.5, low: 241 },
		dates: { start: "Jul 22", end: "Aug 21" },
		points: [0.45, 0.46, 0.48, 0.47, 0.5, 0.52, 0.51, 0.54, 0.55, 0.53, 0.56, 0.58, 0.57, 0.6, 0.61, 0.63],
		holdings: [
			{ symbol: "COST", color: "#e31837", weight: 26 },
			{ symbol: "MSFT", color: "#00a4ef", weight: 24 },
			{ symbol: "AAPL", color: "#a2aaad", weight: 20 },
			{ symbol: "GOOGL", color: "#34a853", weight: 18 },
			{ symbol: "USDC", color: "#2775ca", weight: 12 },
		],
		icon: "leaf",
	},
];
