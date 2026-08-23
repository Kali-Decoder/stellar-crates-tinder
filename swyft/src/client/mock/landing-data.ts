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
		changePct: 8.18,
		period: "1 Month",
		description:
			"Owns leading chip, cloud, and application companies in one basket.",
		range: { high: 1136, midHigh: 1083, mid: 1030, low: 976.28 },
		dates: { start: "Jul 23", end: "Aug 22" },
		points: [
			0.22, 0.28, 0.25, 0.34, 0.31, 0.42, 0.48, 0.45, 0.58, 0.62, 0.71, 0.68,
			0.78, 0.84, 0.8, 0.9,
		],
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
		description: "A swipe-ready mix of tokenized equities settling on Stellar.",
		range: { high: 412, midHigh: 398, mid: 381.2, low: 364 },
		dates: { start: "Jul 22", end: "Aug 21" },
		points: [
			0.4, 0.38, 0.45, 0.42, 0.5, 0.55, 0.52, 0.61, 0.58, 0.66, 0.7, 0.68, 0.74,
			0.72, 0.8, 0.78,
		],
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
		description: "Concentrated majors with room for a few high-conviction alts.",
		range: { high: 128.4, midHigh: 121.1, mid: 114.6, low: 108.2 },
		dates: { start: "Jul 22", end: "Aug 21" },
		points: [
			0.72, 0.68, 0.74, 0.62, 0.58, 0.65, 0.55, 0.5, 0.48, 0.42, 0.5, 0.45, 0.4,
			0.38, 0.44, 0.41,
		],
		holdings: [
			{ symbol: "BTC", color: "#f7931a", weight: 40 },
			{ symbol: "ETH", color: "#627eea", weight: 30 },
			{ symbol: "XLM", color: "#08b5e5", weight: 20 },
			{ symbol: "USDC", color: "#2775ca", weight: 10 },
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
		points: [
			0.45, 0.46, 0.48, 0.47, 0.5, 0.52, 0.51, 0.54, 0.55, 0.53, 0.56, 0.58,
			0.57, 0.6, 0.61, 0.63,
		],
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

export type LandingAssetClass = {
	id: string;
	tag: string;
	title: string;
	description: string;
	summary: string;
	symbols: string[];
	wide?: boolean;
};

export const LANDING_ASSET_CLASSES: LandingAssetClass[] = [
	{
		id: "stocks",
		tag: "Public markets",
		title: "Stocks",
		description:
			"Tokenized equities from blue chips to growth names, priced by DIA and settled on Stellar.",
		summary: "Equities on-chain",
		symbols: ["NVDA", "TSLA", "AAPL"],
	},
	{
		id: "crypto",
		tag: "Digital assets",
		title: "Crypto",
		description:
			"Bitcoin and ether exposure via listed ETF wrappers, plus majors settling beside USDC.",
		summary: "BTC & ETH wrappers",
		symbols: ["IBIT", "ETHA", "BITO"],
	},
	{
		id: "pre-ipo",
		tag: "Tech & consumer",
		title: "Mega-caps",
		description:
			"Swipe into household names already live as vault-ready Stellar tokens.",
		summary: "Mega-cap stocks",
		symbols: ["MSFT", "GOOGL", "AMZN"],
	},
	{
		id: "commodities",
		tag: "Real assets",
		title: "Commodities",
		description:
			"Gold, silver, oil, gas, and metals feeds routed through DIA commodity markets.",
		summary: "Metals & energy",
		symbols: ["XAU", "XAGG", "WTI"],
		wide: true,
	},
	{
		id: "etfs",
		tag: "Funds & strategies",
		title: "ETFs",
		description:
			"Broad indexes, bonds, and sector funds you can basket with the same swipe ritual.",
		summary: "Indexes & funds",
		symbols: ["SPY", "QQQ", "VOO"],
		wide: true,
	},
];

export type LandingCurrency = {
	code: string;
	name: string;
	flag: string;
};

export const LANDING_CURRENCIES: LandingCurrency[] = [
	{ code: "TRY", name: "Turkish lira", flag: "🇹🇷" },
	{ code: "RUB", name: "Russian ruble", flag: "🇷🇺" },
	{ code: "BRL", name: "Brazilian real", flag: "🇧🇷" },
	{ code: "INR", name: "Indian rupee", flag: "🇮🇳" },
	{ code: "IDR", name: "Indonesian rupiah", flag: "🇮🇩" },
	{ code: "ZAR", name: "South African rand", flag: "🇿🇦" },
	{ code: "SGD", name: "Singapore dollar", flag: "🇸🇬" },
	{ code: "ARS", name: "Argentine peso", flag: "🇦🇷" },
	{ code: "NGN", name: "Nigerian naira", flag: "🇳🇬" },
	{ code: "COP", name: "Colombian peso", flag: "🇨🇴" },
	{ code: "PEN", name: "Peruvian sol", flag: "🇵🇪" },
];

/** Normalized 0–1 series for the comparison chart (2021 → today). */
export const LANDING_PERF_SERIES = {
	modernWarfare: [0.12, 0.18, 0.22, 0.28, 0.35, 0.42, 0.48, 0.55, 0.62, 0.72, 0.82, 0.93],
	trump: [0.11, 0.16, 0.2, 0.26, 0.32, 0.38, 0.44, 0.5, 0.58, 0.66, 0.74, 0.78],
	sp500: [0.13, 0.15, 0.16, 0.17, 0.18, 0.19, 0.2, 0.21, 0.22, 0.23, 0.24, 0.255],
	cash: [0.14, 0.13, 0.11, 0.1, 0.09, 0.08, 0.07, 0.055, 0.045, 0.035, 0.028, 0.024],
} as const;

export const LANDING_PERF_ENDINGS = {
	modernWarfare: 69697,
	trump: 58131,
	sp500: 19033,
	cash: 1768,
} as const;

export type AiPortfolioHolding = {
	name: string;
	symbol: string;
	weight: number;
	logoSymbol: string;
};

export const LANDING_AI_PORTFOLIO = {
	prompt: "Position for Europe’s tech stagnation",
	title: "U.S. platform advantage",
	holdings: [
		{ name: "Microsoft", symbol: "MSFTx", weight: 25, logoSymbol: "MSFT" },
		{ name: "Amazon", symbol: "AMZNx", weight: 25, logoSymbol: "AMZN" },
		{ name: "Alphabet", symbol: "GOOGLx", weight: 25, logoSymbol: "GOOGL" },
		{ name: "Oracle", symbol: "ORCLx", weight: 25, logoSymbol: "ORCL" },
	] satisfies AiPortfolioHolding[],
};

export type LandingFaq = {
	id: string;
	question: string;
	answer: string;
};

export const LANDING_FAQS: LandingFaq[] = [
	{
		id: "what",
		question: "What is swyft.fun?",
		answer:
			"swyft.fun is a swipe-to-allocate investing ritual for tokenized RWAs on Stellar. You set a budget, swipe assets into a basket, and deposit with your own wallet.",
	},
	{
		id: "ai",
		question: "How does the AI work?",
		answer:
			"Describe a market view in plain language. Swyft drafts an editable basket with equal or weighted allocations and short reasoning you can tweak before funding.",
	},
	{
		id: "wallet",
		question: "Do I need a crypto wallet or crypto to start investing?",
		answer:
			"You’ll connect a Stellar wallet (Freighter works great). On testnet you use DEMOUSD; nothing moves without your signature.",
	},
	{
		id: "custody",
		question: "Do you have access to my funds?",
		answer:
			"No. swyft.fun is non-custodial. You stay in control of your account and assets, and every transaction requires your authorization.",
	},
	{
		id: "jurisdictions",
		question: "Which jurisdictions are restricted?",
		answer:
			"Availability depends on local rules for tokenized securities and wallets. Always review eligibility and risk disclosures before investing.",
	},
	{
		id: "hours",
		question: "What are market hours?",
		answer:
			"Onchain deposits and share minting are 24/7 on Stellar. Underlying RWA prices follow their market calendars and DIA oracle updates.",
	},
	{
		id: "withdraw",
		question: "Can I withdraw?",
		answer:
			"Yes. Redeem share tokens back through the vault when you’re ready. Preview claims before you sign so allocations stay clear.",
	},
];
