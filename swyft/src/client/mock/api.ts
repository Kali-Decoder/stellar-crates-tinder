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
	buildPreparedExecutionFromCandidates,
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
	candidatesById: Map<string, CandidateLite>;
}

type CandidateLite = FeedResponse["candidates"][number];

const MOCK_STATE_KEY = "__swyftMockApiState__";

/** Survive Vite HMR so review still finds the open session React holds. */
function getState(): MockState {
	const globalStore = globalThis as typeof globalThis & {
		[MOCK_STATE_KEY]?: MockState;
	};
	if (!globalStore[MOCK_STATE_KEY]) {
		globalStore[MOCK_STATE_KEY] = {
			sessions: new Map(),
			feeds: new Map(),
			executions: new Map(),
			lastCandidates: [],
			candidatesById: new Map(),
		};
	} else if (!globalStore[MOCK_STATE_KEY].candidatesById) {
		globalStore[MOCK_STATE_KEY].candidatesById = new Map();
	}
	return globalStore[MOCK_STATE_KEY];
}

/** Rebuild a missing session under the same id (HMR / remount). */
function ensureSession(sessionId: string): WeeklySession {
	const state = getState();
	const existing = state.sessions.get(sessionId);
	if (existing) return existing;
	const preferences = state.preferences;
	const revived: WeeklySession = {
		id: sessionId,
		epochId: `mock:revived:${Date.now()}`,
		chain: preferences?.activeChain ?? "ROBINHOOD",
		wallet: MOCK_WALLET,
		executionProvider: preferences?.executionProvider ?? "ZERO_EX",
		feedRankingProvider: preferences?.feedRankingProvider ?? "DETERMINISTIC",
		status: "OPEN",
	};
	state.sessions.set(sessionId, revived);
	return revived;
}

export function createMockApi(): MockApi {
	return {
		async config() {
			await delay(80);
			return MOCK_CONFIG;
		},
		async preferences() {
			await delay(60);
			const state = getState();
			if (!state.preferences) throw new Error("PREFERENCES_NOT_FOUND");
			return state.preferences;
		},
		async savePreferences(preferences) {
			await delay(60);
			getState().preferences = preferences;
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
			return mockSolanaPortfolio(getState().lastCandidates);
		},
		async robinhoodPortfolio() {
			await delay(80);
			return mockRobinhoodPortfolio(getState().lastCandidates);
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
			getState().sessions.set(session.id, session);
			return session;
		},
		async generateFeed(sessionId, preferences, excludedAssetIds = []) {
			await delay(450);
			const state = getState();
			const session = ensureSession(sessionId);
			state.preferences = preferences;
			const feed = buildMockFeed(session, preferences, excludedAssetIds);
			const candidates = await enrichCandidatesWithDiaPrices(feed.candidates);
			const enriched = { ...feed, candidates };
			state.feeds.set(sessionId, enriched);
			state.lastCandidates = enriched.candidates;
			for (const candidate of enriched.candidates) {
				state.candidatesById.set(candidate.assetId, candidate);
			}
			return enriched;
		},
		async prepareExecution(
			sessionId,
			assetIds,
			ticketSizeUsd,
			periodLimitUsd,
			_chain = "ROBINHOOD",
		) {
			await delay(180);
			const state = getState();
			const session = ensureSession(sessionId);
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

			const fromFeed = assetIds
				.map((id) => state.candidatesById.get(id))
				.filter((c): c is CandidateLite => Boolean(c));

			let prepared: ExecutionRecord;
			if (fromFeed.length === assetIds.length) {
				const priced = await enrichCandidatesWithDiaPrices(fromFeed);
				prepared = buildPreparedExecutionFromCandidates(
					session,
					priced,
					ticketSizeUsd,
					periodLimitUsd,
				);
			} else {
				prepared = buildPreparedExecution(
					session,
					{ ...preferences, ticketSizeUsd, periodLimitUsd },
					assetIds,
					periodLimitUsd,
				);
			}

			state.executions.set(prepared.plan.executionId, prepared);
			return prepared;
		},
		async demoSettle(executionId) {
			await delay(600);
			const state = getState();
			const current = state.executions.get(executionId);
			if (!current) throw new Error("EXECUTION_NOT_FOUND");
			const settled = settleMockExecution(current);
			state.executions.set(executionId, settled);
			return settled;
		},
		async markSubmitted(executionId, transactionHashes) {
			await delay(200);
			const state = getState();
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
			const state = getState();
			const current = state.executions.get(executionId);
			if (!current) throw new Error("EXECUTION_NOT_FOUND");
			if (current.status === "SETTLED") return current;
			const settled = settleMockExecution(current);
			state.executions.set(executionId, settled);
			return settled;
		},
		async execution(executionId) {
			await delay(80);
			const current = getState().executions.get(executionId);
			if (!current) throw new Error("EXECUTION_NOT_FOUND");
			return current;
		},
		async prepareExit(assetId, amountInBaseUnits) {
			await delay(400);
			const state = getState();
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
