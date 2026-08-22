import {
	ASSET_REGISTRY,
	DEFAULT_SLOT_BUDGET,
	FEED_PAGE_SIZE,
	isDegenCommunityAsset,
} from "../../domain/constants";
import type { Candidate, OnboardingPreferences } from "../../domain/schemas";
import { ticketSizeToBaseUnits } from "../../domain/schemas";
import type {
	AssetDetailsResponse,
	AssetHistoryResponse,
	AssetIconsResponse,
	ExecutionRecord,
	FeedResponse,
	PublicConfig,
	RobinhoodPortfolioResponse,
	SolanaBalanceResponse,
	SolanaPortfolioResponse,
	TokenBalanceResponse,
	WeeklySession,
} from "../api";
import { MOCK_WALLET } from "./enabled";

const OUTPUTS: Record<string, string> = {
	WETH: "3113000000000000",
	GME: "468000000000000000",
	NVDA: "48070000000000000",
	SPCX: "89300000000000000",
	MSTR: "89000000000000000",
	GOOGL: "31460000000000000",
	AAPL: "29780000000000000",
	RDDT: "47890000000000000",
	MSFT: "22200000000000000",
	TSLA: "30780000000000000",
	COST: "10000000000000000",
	MU: "200000000000000000",
	STEEL: "200000000000000000",
	YOINK: "1000000000000000000000",
};

const META: Record<
	string,
	{ priceImpactBps: number; crowdScoreBps: number; reason: string; priceUsd: number }
> = {
	WETH: {
		priceImpactBps: 19,
		crowdScoreBps: 6_100,
		reason: "Positive crypto breadth and an executable low-impact route.",
		priceUsd: 3210.42,
	},
	GME: {
		priceImpactBps: 38,
		crowdScoreBps: 5_781,
		reason: "Strong market activity and a fresh Stellar token route.",
		priceUsd: 21.35,
	},
	NVDA: {
		priceImpactBps: 31,
		crowdScoreBps: 5_340,
		reason: "Healthy market state and a current route within the policy limit.",
		priceUsd: 208.1,
	},
	SPCX: {
		priceImpactBps: 24,
		crowdScoreBps: 5_120,
		reason: "Fresh tokenized market exposure on Stellar with a low estimated route impact.",
		priceUsd: 112.0,
	},
	MSTR: {
		priceImpactBps: 28,
		crowdScoreBps: 5_010,
		reason: "Active market state and a fresh route within the policy limit.",
		priceUsd: 112.4,
	},
	GOOGL: {
		priceImpactBps: 26,
		crowdScoreBps: 4_920,
		reason: "Healthy market state and a fresh executable route.",
		priceUsd: 178.2,
	},
	AAPL: {
		priceImpactBps: 33,
		crowdScoreBps: 4_810,
		reason: "Strong crowd signal with acceptable estimated route impact.",
		priceUsd: 211.8,
	},
	RDDT: {
		priceImpactBps: 21,
		crowdScoreBps: 4_700,
		reason: "Fresh tokenized RWA route on Stellar within the execution guardrails.",
		priceUsd: 148.6,
	},
	MSFT: {
		priceImpactBps: 41,
		crowdScoreBps: 4_590,
		reason: "Steady crowd preference and a low-impact Stellar RWA route.",
		priceUsd: 450.1,
	},
	TSLA: {
		priceImpactBps: 18,
		crowdScoreBps: 4_480,
		reason: "Active market state and a fresh route within the policy limit.",
		priceUsd: 248.9,
	},
	COST: {
		priceImpactBps: 22,
		crowdScoreBps: 4_370,
		reason: "Eligible consumer exposure with a current executable route.",
		priceUsd: 980.0,
	},
	MU: {
		priceImpactBps: 25,
		crowdScoreBps: 4_260,
		reason: "Eligible semiconductor exposure with a current executable route.",
		priceUsd: 98.4,
	},
	STEEL: {
		priceImpactBps: 85,
		crowdScoreBps: 8_200,
		reason:
			"Degen community token with a fresh executable route and elevated volatility.",
		priceUsd: 0.42,
	},
	YOINK: {
		priceImpactBps: 92,
		crowdScoreBps: 8_050,
		reason:
			"Degen community token with a fresh executable route and elevated volatility.",
		priceUsd: 0.0081,
	},
};

export const MOCK_CONFIG: PublicConfig = {
	demoMode: true,
	executionMode: "demo",
	chainId: 4663,
	stableToken: "USDG",
	solana: {
		available: false,
		cluster: "mainnet-beta",
		stableToken: "USDC",
		inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
		executionProviders: {
			JUPITER: { available: false },
			ZERO_EX: { available: false },
		},
	},
	executionProviders: {
		ZERO_EX: { available: true },
		UNISWAP: { available: false },
		JUPITER: { available: false },
	},
	feedRankingProviders: {
		ZERO_G: { available: false },
		DETERMINISTIC: { available: true },
	},
	maxCards: 10,
	privy: { appId: "mock-ui-no-privy" },
};

function commitment(seed: string) {
	let hash = 0;
	for (let i = 0; i < seed.length; i += 1) {
		hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
	}
	const hex = `${hash.toString(16).padStart(8, "0")}${"a".repeat(56)}`;
	return `sha256:${hex.slice(0, 64)}`;
}

function fixtureAssets(includeCommunity: boolean) {
	const stellarFirst = [
		"AAPL",
		"NVDA",
		"MSFT",
		"TSLA",
		"META",
		"AMZN",
		"GOOGL",
		"JPM",
		"DIS",
		"KO",
	];
	return Object.values(ASSET_REGISTRY)
		.filter(
			(asset) =>
				Boolean(OUTPUTS[asset.symbol] && META[asset.symbol]) &&
				(includeCommunity || !isDegenCommunityAsset(asset.assetId)),
		)
		.sort((a, b) => {
			const ai = stellarFirst.indexOf(a.symbol);
			const bi = stellarFirst.indexOf(b.symbol);
			const aRank = ai === -1 ? 999 : ai;
			const bRank = bi === -1 ? 999 : bi;
			return aRank - bRank;
		});
}

export function buildMockCandidates(
	preferences: OnboardingPreferences,
	amountInBaseUnits: string,
	excludedAssetIds: string[] = [],
	limit = FEED_PAGE_SIZE,
): Candidate[] {
	const excluded = new Set(excludedAssetIds);
	const includeCommunity = preferences.riskMode === "degen";
	const allowed = new Set(preferences.assetClasses);
	const amount = BigInt(amountInBaseUnits);
	const now = Date.now();
	const expiresAt = new Date(now + 60_000).toISOString();
	const quotedAt = new Date(now).toISOString();

	return fixtureAssets(includeCommunity)
		.filter(
			(asset) =>
				allowed.has(asset.kind) &&
				!excluded.has(asset.assetId),
		)
		.slice(0, limit)
		.map((asset) => {
			const baseEstimate = OUTPUTS[asset.symbol];
			const meta = META[asset.symbol];
			if (!baseEstimate || !meta) {
				throw new Error(`MOCK_FIXTURE_MISSING_${asset.symbol}`);
			}
			const estimated = (
				(BigInt(baseEstimate) * amount) /
				DEFAULT_SLOT_BUDGET
			).toString();
			const minimum = ((BigInt(estimated) * 995n) / 1000n).toString();
			return {
				chain: "ROBINHOOD" as const,
				assetId: asset.assetId,
				symbol: asset.symbol,
				name: asset.name,
				kind: asset.kind,
				contract: asset.address,
				decimals: asset.decimals,
				eligible: true,
				marketHealthy: true,
				permissionAllowed: true,
				marketPriceUsd: meta.priceUsd,
				marketDataSource: "demo" as const,
				marketDataUpdatedAt: new Date(now).toISOString(),
				primaryClassification:
					asset.kind === "STOCK_TOKEN"
						? ("TOKENIZED_STOCK" as const)
						: ("CRYPTO" as const),
				classificationConfidence: "HIGH" as const,
				tags: [asset.kind === "STOCK_TOKEN" ? "stock" : "crypto"],
				riskFlags: [] as string[],
				classificationEvidence: [`mock:registry:${asset.symbol}`],
				crowdScoreBps: meta.crowdScoreBps,
				reason: meta.reason,
				evidenceIds: [`mock:${asset.symbol}:price`, `mock:${asset.symbol}:route`],
				quote: {
					requestId: `mock-quote-${asset.symbol}-${now}`,
					provider: preferences.executionProvider,
					chain: "ROBINHOOD" as const,
					assetId: asset.assetId,
					tokenOut: asset.address,
					amountInBaseUnits,
					estimatedAmountOut: estimated,
					minimumAmountOut: minimum,
					unitPriceUsd: String(meta.priceUsd),
					priceImpactBps: meta.priceImpactBps,
					routing:
						preferences.executionProvider === "ZERO_EX"
							? ("ZERO_EX" as const)
							: ("CLASSIC" as const),
					quotedAt,
					expiresAt,
				},
			};
		});
}

export function buildMockFeed(
	session: WeeklySession,
	preferences: OnboardingPreferences,
	excludedAssetIds: string[] = [],
): FeedResponse {
	const amount = ticketSizeToBaseUnits(preferences.ticketSizeUsd).toString();
	const candidates = buildMockCandidates(preferences, amount, excludedAssetIds);
	const inputCommitment = commitment(
		`${session.id}:${preferences.ticketSizeUsd}:${excludedAssetIds.join(",")}`,
	);
	const outputCommitment = commitment(
		candidates.map((c) => c.assetId).join("|"),
	);
	return {
		candidates,
		hasMore: candidates.length >= FEED_PAGE_SIZE,
		rankedAssetCount: candidates.length,
		feed: {
			schemaVersion: "investmade-feed-output/v1",
			sessionId: session.id,
			inputCommitment,
			policyVersion: "investmade-policy/v1",
			regime: "CRYPTO_NEUTRAL",
			cards: candidates.map((candidate, index) => ({
				assetId: candidate.assetId,
				action: "BUY" as const,
				rank: index + 1,
				amountInBaseUnits: amount,
				scoreBps: Math.max(1_000, 8_000 - index * 180),
				evidenceIds: candidate.evidenceIds,
				reason: candidate.reason,
			})),
			warnings: [],
		},
		proof: {
			network: "mock",
			model: "mock-ranker/v1",
			provider: "local-fixture",
			teeVerified: false,
			inputCommitment,
			outputCommitment,
			requestedProvider: preferences.feedRankingProvider,
			effectiveProvider: "DETERMINISTIC",
			warnings: ["Mock UI · ranking is local fixture data."],
		},
	};
}

export function buildMockHistory(assetId: string): AssetHistoryResponse {
	const symbol = assetId.split(":").at(-1) ?? "ASSET";
	const base = META[symbol]?.priceUsd ?? 100;
	const now = Date.now();
	const points = Array.from({ length: 30 }, (_, index) => {
		const day = 29 - index;
		const wobble = Math.sin(index / 3) * 0.04 + (index % 5) * 0.002;
		return {
			timestamp: now - day * 86_400_000,
			price: Number((base * (1 + wobble)).toFixed(4)),
		};
	});
	return {
		period: "1M",
		source: "demo",
		points,
		requestedPeriod: "1M",
		effectivePeriod: "1M",
		coverageStart: points[0]?.timestamp,
		coverageEnd: points.at(-1)?.timestamp,
		sourceAsset: symbol,
		isCompleteHistory: true,
	};
}

export function buildMockIcons(): AssetIconsResponse {
	return { icons: {} };
}

export function buildMockDetails(assetId: string): AssetDetailsResponse {
	const symbol = assetId.split(":").at(-1) ?? "ASSET";
	const asset = Object.values(ASSET_REGISTRY).find((item) => item.assetId === assetId);
	return {
		assetId,
		source: "unavailable",
		categories: asset?.kind === "STOCK_TOKEN" ? ["Tokenized stock"] : ["Crypto"],
		marketCapUsd: (META[symbol]?.priceUsd ?? 1) * 1_000_000_000,
		volume24hUsd: 12_500_000,
		contract: asset?.address,
		community: [],
		updatedAt: new Date().toISOString(),
	};
}

export function mockUsdgBalance(): TokenBalanceResponse {
	return {
		asset: "USDG",
		chainId: 4663,
		decimals: 6,
		balanceBaseUnits: "250000000",
	};
}

export function mockSolanaBalance(): SolanaBalanceResponse {
	return {
		cluster: "mainnet-beta",
		address: MOCK_WALLET,
		solBalanceLamports: "1500000000",
		usdcBalanceBaseUnits: "250000000",
		usdcDecimals: 6,
	};
}

export function mockRobinhoodPortfolio(
	candidates: Candidate[],
): RobinhoodPortfolioResponse {
	const held = candidates.slice(0, 3);
	return {
		chainId: 4663,
		address: MOCK_WALLET,
		tokens: held.map((candidate, index) => ({
			assetId: candidate.assetId,
			contract: candidate.contract ?? `0x${index.toString(16).padStart(40, "0")}`,
			symbol: candidate.symbol,
			name: candidate.name,
			kind: candidate.kind,
			decimals: candidate.decimals ?? 18,
			balanceBaseUnits: String(10n ** BigInt(candidate.decimals ?? 18) / 4n),
			priceUsd: candidate.marketPriceUsd,
			priceUpdatedAt: new Date().toISOString(),
			marketDataSource: "demo",
		})),
	};
}

export function mockSolanaPortfolio(
	candidates: Candidate[],
): SolanaPortfolioResponse {
	return {
		cluster: "mainnet-beta",
		address: MOCK_WALLET,
		tokens: candidates.slice(0, 2).map((candidate, index) => ({
			assetId: candidate.assetId,
			mint: candidate.contract ?? `Mint${index}`,
			symbol: candidate.symbol,
			name: candidate.name,
			decimals: candidate.decimals ?? 6,
			balanceBaseUnits: "2500000",
			priceUsd: candidate.marketPriceUsd,
			priceUpdatedAt: new Date().toISOString(),
		})),
	};
}

export function buildPreparedExecution(
	session: WeeklySession,
	preferences: OnboardingPreferences,
	assetIds: string[],
	periodLimitUsd: number,
): ExecutionRecord {
	const amount = ticketSizeToBaseUnits(preferences.ticketSizeUsd).toString();
	const all = buildMockCandidates(preferences, amount, [], 60);
	const selected = assetIds
		.map((id) => all.find((c) => c.assetId === id))
		.filter((c): c is Candidate => Boolean(c));
	const quotes = selected.flatMap((candidate) =>
		candidate.quote ? [candidate.quote] : [],
	);
	if (quotes.length !== selected.length) {
		throw new Error("MOCK_QUOTE_MISSING");
	}
	const totalIn = quotes
		.reduce((sum, quote) => sum + BigInt(quote.amountInBaseUnits), 0n)
		.toString();
	const planHash = commitment(
		`${session.id}:${assetIds.join(",")}:${preferences.ticketSizeUsd}`,
	);
	const executionId = crypto.randomUUID();
	const walletCalls = [
		{
			kind: "APPROVAL" as const,
			transaction: {
				to: "0x0000000000001fF3684f28c67538d4D072C22734",
				from: MOCK_WALLET,
				data: "0x",
				value: "0",
				chainId: 4663,
			},
		},
		...selected.map((candidate) => ({
			kind: "SWAP" as const,
			assetId: candidate.assetId,
			transaction: {
				to: candidate.contract ?? MOCK_WALLET,
				from: MOCK_WALLET,
				data: "0x",
				value: "0",
				chainId: 4663,
			},
		})),
	];
	void periodLimitUsd;
	return {
		plan: {
			executionId,
			sessionId: session.id,
			epochId: session.epochId,
			chain: "ROBINHOOD",
			chainId: 4663,
			inputToken: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
			provider: session.executionProvider,
			quotes,
			totalInputBaseUnits: totalIn,
			authorizedPlanHash: planHash,
			policyHash: commitment("investmade-policy/v1"),
			callCommitments: quotes.map((quote) =>
				commitment(`${quote.assetId}:${quote.amountInBaseUnits}`),
			),
			generatedAt: new Date().toISOString(),
		},
		status: "PREPARED",
		submissionMode: "BATCH",
		transactionHashes: [],
		settledOutputs: [],
		walletCalls,
	};
}

export function settleMockExecution(record: ExecutionRecord): ExecutionRecord {
	const hash = `0xmock${commitment(record.plan.executionId).slice(7, 71)}`;
	return {
		...record,
		status: "SETTLED",
		transactionHashes: [hash],
		settledAt: new Date().toISOString(),
		settledOutputs: record.plan.quotes.map((quote) => ({
			assetId: quote.assetId,
			amountOutBaseUnits: quote.estimatedAmountOut,
			transactionHash: hash,
			blockNumber: "12345678",
			status: "success" as const,
		})),
	};
}
