import { STELLAR_SUPPORTED_ASSET_COUNT } from "./stellar/config";

export type DocsSection = {
	id: string;
	title: string;
	summary: string;
	body: string[];
	bullets?: string[];
	note?: string;
};

export const DOCS_SECTIONS: DocsSection[] = [
	{
		id: "overview",
		title: "What is swyft.fun?",
		summary: "A non-custodial swipe ritual for tokenized RWAs on Stellar.",
		body: [
			"swyft.fun turns a fixed budget into a short investing session. You set rules, swipe assets into a basket, then deposit with your own Stellar wallet.",
			"Nothing moves without your signature. Swyft never holds your keys or custody of funds.",
		],
		bullets: [
			"Stellar testnet today (Freighter / Stellar Wallets Kit)",
			`${STELLAR_SUPPORTED_ASSET_COUNT} tokenized assets deployed on Stellar (plus USDC settlement)`,
			"Soroban vault buckets with equal-weight allocations",
			"Live spots from DIA’s RWA oracle APIs",
			"Portfolio tracking via the Mongo-backed stellar API",
		],
	},
	{
		id: "quickstart",
		title: "Quick start",
		summary: "Connect, plan, swipe, review, invest.",
		body: [
			"From the landing page, connect a Stellar wallet and answer five plan questions. Then build a basket from the feed and confirm on Review.",
		],
		bullets: [
			"Sign in → Freighter (or another kit wallet) on Stellar testnet",
			"Save a plan: cadence, period limit, ticket size, risk, asset mix",
			"Swipe right to add, left to skip — stay inside your budget",
			"Review → Invest on Stellar (3 Freighter prompts) or Simulate only",
		],
		note: "On testnet the vault stablecoin is DEMOUSD, labeled USDC in the UI.",
	},
	{
		id: "wallet",
		title: "Wallet & custody",
		summary: "You stay in control of every approval.",
		body: [
			"swyft.fun is non-custodial. Connecting a wallet only lets the app propose transactions. You approve create_bucket, approve, and deposit in Freighter.",
			"Disconnect anytime from Account. That clears the session on this device; on-chain baskets remain yours.",
		],
		bullets: [
			"Network: Stellar testnet",
			"Stablecoin: DEMOUSD (shown as USDC)",
			"Signatures: three Freighter prompts per live invest",
		],
	},
	{
		id: "plan",
		title: "Your Swyft plan",
		summary: "Rules that bound every swipe session.",
		body: [
			"Onboarding captures how much you are willing to allocate this period and how large each Add decision is. Those rules stay on this device with your session preferences.",
		],
		bullets: [
			"Cadence — daily, weekly, or monthly limit window",
			"Period limit — max USDC for the window",
			"Ticket size — USDC spent per Add",
			"Risk & asset mix — shapes which fixtures appear in the feed",
		],
	},
	{
		id: "basket",
		title: "Building a basket",
		summary: "Swipe cards into a budget-aware selection.",
		body: [
			"Each card shows an asset mark, live DIA-anchored price chart, and ticket stamp. The budget rail tracks remaining limit and selected names.",
			`Swyft currently supports ${STELLAR_SUPPORTED_ASSET_COUNT} deployable vault tokens on Stellar. Assets without a deployed vault token can still appear in the feed; Review skips them on-chain and redistributes weight across deployable symbols.`,
		],
		bullets: [
			"Add — includes the asset if another ticket fits",
			"Skip — advances without spending budget",
			"Review basket — opens quotes and Stellar invest actions",
		],
	},
	{
		id: "invest",
		title: "Investing on Stellar",
		summary: "Create a personal bucket and deposit DEMOUSD.",
		body: [
			"Live invest runs create_bucket → approve DEMOUSD → deposit into the Soroban vault. Equal-weight allocations are built from on-chain symbols in your selection.",
			"Simulate only settles a mock receipt without broadcasting — useful for UI checks when your testnet balance is empty.",
		],
		bullets: [
			"Need enough DEMOUSD on Freighter for the spend amount",
			"Vault mints share tokens representing your bucket",
			"Successful invests are recorded to the portfolio API (Mongo)",
		],
		note: "If prepare hangs or quotes expire, use Refresh quotes or go Back and reopen Review.",
	},
	{
		id: "oracle",
		title: "DIA oracle & prices",
		summary: "Spot levels from DIA RWA REST; charts anchored to that spot.",
		body: [
			"Swipe cards fetch live spots from DIA’s RWA API (equities, ETFs, commodities, FX). Chart history may come from market series when available, rescaled so the tip matches the DIA spot.",
			"On-chain, the dia-oracle contract stores feed keys like AAPL/USD for vault pricing. An updater script mirrors DIA REST into set_prices on testnet.",
		],
		bullets: [
			"UI strip shows feed key, endpoint, age, and spot",
			"Info panel links to the live DIA quote and RWA docs",
			"If Yahoo chart history is rate-limited, charts fall back to DIA-anchored synthetics",
		],
	},
	{
		id: "portfolio",
		title: "Portfolio & activity",
		summary: "Track personal buckets and marked PnL.",
		body: [
			"Portfolio lists baskets owned by your wallet from the stellar portfolio API. Each basket stores cost basis, allocations, and deposit marks from DIA at invest time.",
			"Activity shows the latest receipt — demo settle or live transaction hashes on Stellar Expert.",
		],
		bullets: [
			"Run server with MONGODB_URI for persistent baskets",
			"npm run dev:stack starts UI + portfolio API together",
			"PnL marks refresh from DIA when you open Portfolio",
		],
	},
	{
		id: "architecture",
		title: "Architecture",
		summary: "Client, contracts, and portfolio API.",
		body: [
			"The default UI is the Stellar mock path (VITE_MOCK_UI). Vite proxies /dia-api and /yahoo-api for browser CORS, and /api to the portfolio service on :8787.",
		],
		bullets: [
			"swyft/ — Vite React client + Soroban contracts + scripts",
			"server/ — Express portfolio API (Mongo optional)",
			"Contracts — share-token, bucket-vault, dia-oracle",
			"Scripts — deploy, oracle:fetch, oracle:update",
		],
	},
	{
		id: "faq",
		title: "FAQ",
		summary: "Common questions.",
		body: [],
		bullets: [
			"Is this financial advice? No — ranking and cards are not advice.",
			"Do I need mainnet funds? No — use Stellar testnet + DEMOUSD for the demo vault.",
			"Why SESSION_NOT_FOUND? Refresh quotes; mock sessions revive after hot reload.",
			"Why synthetic charts? Yahoo can 429 or fail TLS; DIA spot still drives the level.",
			"Where are docs in git? See swyft/docs/ for architecture, contracts, and API notes.",
		],
	},
];
