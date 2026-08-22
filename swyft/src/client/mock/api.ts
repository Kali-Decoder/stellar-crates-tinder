import type {
	AppChain,
	ExecutionProviderId,
	FeedRankingProviderId,
	OnboardingPreferences,
} from "../../domain/schemas";
import { ticketSizeToBaseUnits } from "../../domain/schemas";
import type {
	AssetDetailsResponse,
	AssetHistoryResponse,
	AssetIconsResponse,
	ExecutionRecord,
	ExitPreparation,
	FeedResponse,
	HistoryPeriod,
	PublicConfig,
	RobinhoodPortfolioResponse,
	SolanaBalanceResponse,
	SolanaPortfolioResponse,
	TokenBalanceResponse,
	WeeklySession,
} from "../api";
import {
	buildMockDetails,
	buildMockFeed,
	buildMockHistory,
	buildMockIcons,
	buildPreparedExecution,
	MOCK_CONFIG,
	mockRobinhoodPortfolio,
	mockSolanaBalance,
	mockSolanaPortfolio,
	mockUsdgBalance,
	settleMockExecution,
} from "./data";
import { MOCK_WALLET } from "./enabled";
import {
	enrichCandidatesWithDiaPrices,
	fetchDiaAssetHistory,
} from "../stellar/dia-api";

type MockApi = {
	config: () => Promise<PublicConfig>;
	preferences: () => Promise<OnboardingPreferences>;
	savePreferences: (
		preferences: OnboardingPreferences,
	) => Promise<OnboardingPreferences>;
	assetIcons: () => Promise<AssetIconsResponse>;
	assetDetails: (assetId: string) => Promise<AssetDetailsResponse>;
	assetHistory: (
		assetId: string,
		period?: HistoryPeriod,
		refresh?: boolean,
	) => Promise<AssetHistoryResponse>;
	usdgBalance: (wallet: string) => Promise<TokenBalanceResponse>;
	solanaBalance: (wallet: string) => Promise<SolanaBalanceResponse>;
	solanaPortfolio: (wallet: string) => Promise<SolanaPortfolioResponse>;
	robinhoodPortfolio: (wallet: string) => Promise<RobinhoodPortfolioResponse>;
	openSession: (
		cadence: OnboardingPreferences["cadence"],
		executionProvider?: ExecutionProviderId,
		chain?: AppChain,
		feedRankingProvider?: FeedRankingProviderId,
	) => Promise<WeeklySession>;
	generateFeed: (
		sessionId: string,
		preferences: OnboardingPreferences,
		excludedAssetIds?: string[],
	) => Promise<FeedResponse>;
	prepareExecution: (
		sessionId: string,
		assetIds: string[],
		ticketSizeUsd: number,
		periodLimitUsd: number,
		chain?: AppChain,
	) => Promise<ExecutionRecord>;
	demoSettle: (executionId: string) => Promise<ExecutionRecord>;
	markSubmitted: (
		executionId: string,
		transactionHashes: string[],
		batched?: boolean,
	) => Promise<ExecutionRecord>;
	submitSolana: (
		executionId: string,
		signedTransactions: string[],
	) => Promise<ExecutionRecord>;
	reconcile: (executionId: string) => Promise<ExecutionRecord>;
	execution: (executionId: string) => Promise<ExecutionRecord>;
	prepareExit: (
		assetId: string,
		amountInBaseUnits: string,
	) => Promise<ExitPreparation>;
	submitSolanaExit: (
		assetId: string,
		signedTransaction: string,
	) => Promise<{ signature: string; status: "SUBMITTED" }>;
	solanaExitStatus: (
		assetId: string,
	) => Promise<{
		signature: string;
		status: "PENDING" | "FAILED" | "SETTLED";
	}>;
};

const delay = (ms = 280) => new Promise((resolve) => setTimeout(resolve, ms));

interface MockState {
	preferences?: OnboardingPreferences;
	sessions: Map<string, WeeklySession>;
	feeds: Map<string, FeedResponse>;
	executions: Map<string, ExecutionRecord>;
	lastCandidates: CandidateLite[];
}

type CandidateLite = FeedResponse["candidates"][number];

const state: MockState = {
	sessions: new Map(),
	feeds: new Map(),
	executions: new Map(),
	lastCandidates: [],
};

function requireSession(sessionId: string) {
	const session = state.sessions.get(sessionId);
	if (!session) throw new Error("SESSION_NOT_FOUND");
	return session;
}

export function createMockApi(): MockApi {
	return {
		async config() {
			await delay(80);
			return MOCK_CONFIG;
		},
		async preferences() {
			await delay(60);
			if (!state.preferences) throw new Error("PREFERENCES_NOT_FOUND");
			return state.preferences;
		},
		async savePreferences(preferences) {
			await delay(60);
			state.preferences = preferences;
			return preferences;
		},
		async assetIcons() {
			await delay(40);
			return buildMockIcons();
		},
		async assetDetails(assetId) {
			await delay(40);
			return buildMockDetails(assetId);
		},
		async assetHistory(assetId, period = "1W", refresh = false) {
			try {
				return await fetchDiaAssetHistory(assetId, period, refresh);
			} catch {
				return { ...buildMockHistory(assetId), period, requestedPeriod: period };
			}
		},
		async usdgBalance() {
			await delay(40);
			return mockUsdgBalance();
		},
		async solanaBalance() {
			await delay(40);
			return mockSolanaBalance();
		},
		async solanaPortfolio() {
			await delay(80);
			return mockSolanaPortfolio(state.lastCandidates);
		},
		async robinhoodPortfolio() {
			await delay(80);
			return mockRobinhoodPortfolio(state.lastCandidates);
		},
		async openSession(
			cadence,
			executionProvider = "ZERO_EX",
			chain = "ROBINHOOD",
			feedRankingProvider = "DETERMINISTIC",
		) {
			await delay(120);
			const session: WeeklySession = {
				id: crypto.randomUUID(),
				epochId: `mock:${cadence}:${Date.now()}`,
				chain,
				wallet: MOCK_WALLET,
				executionProvider,
				feedRankingProvider,
				status: "OPEN",
			};
			state.sessions.set(session.id, session);
			return session;
		},
		async generateFeed(sessionId, preferences, excludedAssetIds = []) {
			await delay(450);
			const session = requireSession(sessionId);
			state.preferences = preferences;
			const feed = buildMockFeed(session, preferences, excludedAssetIds);
			const candidates = await enrichCandidatesWithDiaPrices(feed.candidates);
			const enriched = { ...feed, candidates };
			state.feeds.set(sessionId, enriched);
			state.lastCandidates = enriched.candidates;
			return enriched;
		},
		async prepareExecution(
			sessionId,
			assetIds,
			ticketSizeUsd,
			periodLimitUsd,
			_chain = "ROBINHOOD",
		) {
			await delay(500);
			const session = requireSession(sessionId);
			const preferences: OnboardingPreferences = state.preferences ?? {
				executionProvider: session.executionProvider,
				activeChain: session.chain,
				feedRankingProvider: session.feedRankingProvider,
				cadence: "weekly",
				periodLimitUsd,
				ticketSizeUsd,
				riskMode: "balanced",
				assetClasses: ["CRYPTO", "STOCK_TOKEN"],
				riskDisclosureAccepted: true,
			};
			const prepared = buildPreparedExecution(
				session,
				{ ...preferences, ticketSizeUsd, periodLimitUsd },
				assetIds,
				periodLimitUsd,
			);
			state.executions.set(prepared.plan.executionId, prepared);
			return prepared;
		},
		async demoSettle(executionId) {
			await delay(600);
			const current = state.executions.get(executionId);
			if (!current) throw new Error("EXECUTION_NOT_FOUND");
			const settled = settleMockExecution(current);
			state.executions.set(executionId, settled);
			return settled;
		},
		async markSubmitted(executionId, transactionHashes) {
			await delay(200);
			const current = state.executions.get(executionId);
			if (!current) throw new Error("EXECUTION_NOT_FOUND");
			const submitted: ExecutionRecord = {
				...current,
				status: "SUBMITTED",
				transactionHashes,
			};
			state.executions.set(executionId, submitted);
			return submitted;
		},
		async submitSolana(executionId, signedTransactions) {
			return this.markSubmitted(executionId, signedTransactions);
		},
		async reconcile(executionId) {
			await delay(300);
			const current = state.executions.get(executionId);
			if (!current) throw new Error("EXECUTION_NOT_FOUND");
			if (current.status === "SETTLED") return current;
			const settled = settleMockExecution(current);
			state.executions.set(executionId, settled);
			return settled;
		},
		async execution(executionId) {
			await delay(80);
			const current = state.executions.get(executionId);
			if (!current) throw new Error("EXECUTION_NOT_FOUND");
			return current;
		},
		async prepareExit(assetId, amountInBaseUnits) {
			await delay(400);
			const candidate =
				state.lastCandidates.find((item) => item.assetId === assetId) ??
				state.lastCandidates[0];
			if (!candidate) throw new Error("ASSET_NOT_FOUND");
			const quote = {
				requestId: `mock-exit-${assetId}`,
				provider: "ZERO_EX" as const,
				chain: "ROBINHOOD" as const,
				assetId,
				tokenOut: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
				amountInBaseUnits,
				estimatedAmountOut: ticketSizeToBaseUnits(9.85).toString(),
				minimumAmountOut: ticketSizeToBaseUnits(9.7).toString(),
				unitPriceUsd: String(candidate.marketPriceUsd ?? 1),
				priceImpactBps: 28,
				routing: "ZERO_EX" as const,
				quotedAt: new Date().toISOString(),
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
			};
			return {
				kind: "EVM_CALLS",
				provider: "ZERO_EX",
				asset: {
					assetId,
					symbol: candidate.symbol,
					decimals: candidate.decimals ?? 18,
				},
				quote,
				walletCalls: [
					{
						kind: "SWAP",
						assetId,
						transaction: {
							to: candidate.contract ?? MOCK_WALLET,
							from: MOCK_WALLET,
							data: "0x",
							value: "0",
							chainId: 4663,
						},
					},
				],
			};
		},
		async submitSolanaExit() {
			await delay(300);
			return { signature: `mock-sig-${Date.now()}`, status: "SUBMITTED" };
		},
		async solanaExitStatus() {
			await delay(200);
			return { signature: `mock-sig-${Date.now()}`, status: "SETTLED" };
		},
	};
}
