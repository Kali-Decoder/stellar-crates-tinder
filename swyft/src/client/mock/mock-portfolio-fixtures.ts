import type { Candidate, OnboardingPreferences } from "../../domain/schemas";
import type { ExecutionRecord, WeeklySession } from "../api";
import type { WalletPortfolioPayload } from "../stellar/portfolio-api";
import { stellarConfig } from "../stellar/config";
import {
	buildMockCandidates,
	buildPreparedExecutionFromCandidates,
	settleMockExecution,
} from "./data";

export const DEMO_PREFERENCES: OnboardingPreferences = {
	activeChain: "ROBINHOOD",
	feedRankingProvider: "DETERMINISTIC",
	cadence: "weekly",
	periodLimitUsd: 100,
	ticketSizeUsd: 10,
	riskMode: "balanced",
	assetClasses: ["STOCK_TOKEN", "CRYPTO"],
	riskDisclosureAccepted: true,
	executionProvider: "ZERO_EX",
};

const DEMO_SESSION: WeeklySession = {
	id: "demo-session-preview",
	epochId: "demo-epoch",
	chain: "ROBINHOOD",
	wallet: "GDEMO0000000000000000000000000000000000000000000",
	executionProvider: "ZERO_EX",
	feedRankingProvider: "DETERMINISTIC",
	status: "OPEN",
};

function stellarHash(seed: string) {
	let hash = 0;
	for (let i = 0; i < seed.length; i += 1) {
		hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
	}
	return `${hash.toString(16).padStart(8, "0")}${"a".repeat(56)}`.slice(0, 64);
}

export function buildDemoCandidates(): Candidate[] {
	return buildMockCandidates(DEMO_PREFERENCES, "10000000", [], 6);
}

export function buildDemoSettlement(): {
	record: ExecutionRecord;
	candidates: Candidate[];
} {
	const candidates = buildDemoCandidates().slice(0, 4);
	const prepared = buildPreparedExecutionFromCandidates(
		DEMO_SESSION,
		candidates,
		DEMO_PREFERENCES.ticketSizeUsd,
		DEMO_PREFERENCES.periodLimitUsd ?? 100,
	);
	const settled = settleMockExecution(prepared);
	const createHash = stellarHash("create");
	const approveHash = stellarHash("approve");
	const depositHash = stellarHash("deposit");
	return {
		candidates,
		record: {
			...settled,
			transactionHashes: [createHash, approveHash, depositHash],
			settledOutputs: settled.settledOutputs.map((output) => ({
				...output,
				transactionHash: depositHash,
			})),
		},
	};
}

export function buildDemoPortfolio(
	wallet = "GDEMO0000000000000000000000000000000000000000000",
): WalletPortfolioPayload {
	const now = new Date().toISOString();
	const vault = stellarConfig.vault;
	const baskets: WalletPortfolioPayload["baskets"] = [
		{
			id: "demo-basket-1",
			ownerWallet: wallet,
			bucketId: 12,
			vaultAddress: vault,
			name: "Modern Warfare",
			status: "active",
			allocations: [
				{
					symbol: "AAPL",
					asset: stellarConfig.tokens.AAPL ?? "CAAPL",
					diaKey: "AAPL/USD",
					targetBps: 2500,
					priceAtDepositUsd: 298.4,
				},
				{
					symbol: "NVDA",
					asset: stellarConfig.tokens.NVDA ?? "CNVDA",
					diaKey: "NVDA/USD",
					targetBps: 2500,
					priceAtDepositUsd: 198.2,
				},
				{
					symbol: "MSFT",
					asset: stellarConfig.tokens.MSFT ?? "CMSFT",
					diaKey: "MSFT/USD",
					targetBps: 2500,
					priceAtDepositUsd: 442.1,
				},
				{
					symbol: "TSLA",
					asset: stellarConfig.tokens.TSLA ?? "CTSLA",
					diaKey: "TSLA/USD",
					targetBps: 2500,
					priceAtDepositUsd: 248.6,
				},
			],
			costBasisUsd: 40,
			sharesOutstanding: "40.0000000",
			createTxHash: stellarHash("b1-create"),
			approveTxHash: stellarHash("b1-approve"),
			depositTxHash: stellarHash("b1-deposit"),
			ledger: [
				{
					kind: "deposit",
					usdAmount: 40,
					shares: "40.0000000",
					txHash: stellarHash("b1-deposit"),
					at: now,
				},
			],
			createdAt: now,
			updatedAt: now,
			pnl: {
				costBasisUsd: 40,
				currentNavUsd: 44.82,
				pnlUsd: 4.82,
				pnlPct: 12.05,
				marks: [
					{
						symbol: "AAPL",
						targetBps: 2500,
						priceAtDepositUsd: 298.4,
						priceNowUsd: 309.42,
						weight: 0.25,
						legNavUsd: 11.37,
						legPnlUsd: 1.37,
						legPnlPct: 13.7,
					},
					{
						symbol: "NVDA",
						targetBps: 2500,
						priceAtDepositUsd: 198.2,
						priceNowUsd: 214.75,
						weight: 0.25,
						legNavUsd: 11.84,
						legPnlUsd: 1.84,
						legPnlPct: 18.4,
					},
					{
						symbol: "MSFT",
						targetBps: 2500,
						priceAtDepositUsd: 442.1,
						priceNowUsd: 450.1,
						weight: 0.25,
						legNavUsd: 10.45,
						legPnlUsd: 0.45,
						legPnlPct: 4.5,
					},
					{
						symbol: "TSLA",
						targetBps: 2500,
						priceAtDepositUsd: 248.6,
						priceNowUsd: 255.3,
						weight: 0.25,
						legNavUsd: 11.16,
						legPnlUsd: 1.16,
						legPnlPct: 11.6,
					},
				],
				method: "demo-fixture",
				note: "Preview marks for UI review — not live vault NAV.",
			},
		},
		{
			id: "demo-basket-2",
			ownerWallet: wallet,
			bucketId: 7,
			vaultAddress: vault,
			name: "Metals & Indexes",
			status: "active",
			allocations: [
				{
					symbol: "SPY",
					asset: stellarConfig.tokens.SPY ?? "CSPY",
					diaKey: "SPY/USD",
					targetBps: 4000,
					priceAtDepositUsd: 720.1,
				},
				{
					symbol: "QQQ",
					asset: stellarConfig.tokens.QQQ ?? "CQQQ",
					diaKey: "QQQ/USD",
					targetBps: 3000,
					priceAtDepositUsd: 680.4,
				},
				{
					symbol: "XAU",
					asset: stellarConfig.tokens.XAU ?? "CXAU",
					diaKey: "XAU/USD",
					targetBps: 3000,
					priceAtDepositUsd: 4480.2,
				},
			],
			costBasisUsd: 30,
			sharesOutstanding: "30.0000000",
			createTxHash: stellarHash("b2-create"),
			approveTxHash: stellarHash("b2-approve"),
			depositTxHash: stellarHash("b2-deposit"),
			ledger: [
				{
					kind: "deposit",
					usdAmount: 30,
					shares: "30.0000000",
					txHash: stellarHash("b2-deposit"),
					at: now,
				},
			],
			createdAt: now,
			updatedAt: now,
			pnl: {
				costBasisUsd: 30,
				currentNavUsd: 31.46,
				pnlUsd: 1.46,
				pnlPct: 4.87,
				marks: [
					{
						symbol: "SPY",
						targetBps: 4000,
						priceAtDepositUsd: 720.1,
						priceNowUsd: 765.69,
						weight: 0.4,
						legNavUsd: 12.76,
						legPnlUsd: 0.76,
						legPnlPct: 6.3,
					},
					{
						symbol: "QQQ",
						targetBps: 3000,
						priceAtDepositUsd: 680.4,
						priceNowUsd: 713.41,
						weight: 0.3,
						legNavUsd: 9.44,
						legPnlUsd: 0.44,
						legPnlPct: 4.9,
					},
					{
						symbol: "XAU",
						targetBps: 3000,
						priceAtDepositUsd: 4480.2,
						priceNowUsd: 4608.11,
						weight: 0.3,
						legNavUsd: 9.26,
						legPnlUsd: 0.26,
						legPnlPct: 2.9,
					},
				],
				method: "demo-fixture",
				note: "Preview marks for UI review — not live vault NAV.",
			},
		},
		{
			id: "demo-basket-3",
			ownerWallet: wallet,
			bucketId: 3,
			vaultAddress: vault,
			name: "Blue-chip mix",
			status: "active",
			allocations: [
				{
					symbol: "AMZN",
					asset: stellarConfig.tokens.AMZN ?? "CAMZN",
					diaKey: "AMZN/USD",
					targetBps: 5000,
					priceAtDepositUsd: 242.5,
				},
				{
					symbol: "GOOG",
					asset: stellarConfig.tokens.GOOG ?? "CGOOG",
					diaKey: "GOOG/USD",
					targetBps: 5000,
					priceAtDepositUsd: 168.9,
				},
			],
			costBasisUsd: 20,
			sharesOutstanding: "20.0000000",
			createTxHash: stellarHash("b3-create"),
			approveTxHash: stellarHash("b3-approve"),
			depositTxHash: stellarHash("b3-deposit"),
			ledger: [
				{
					kind: "deposit",
					usdAmount: 20,
					shares: "20.0000000",
					txHash: stellarHash("b3-deposit"),
					at: now,
				},
			],
			createdAt: now,
			updatedAt: now,
			pnl: {
				costBasisUsd: 20,
				currentNavUsd: 21.18,
				pnlUsd: 1.18,
				pnlPct: 5.9,
				marks: [
					{
						symbol: "AMZN",
						targetBps: 5000,
						priceAtDepositUsd: 242.5,
						priceNowUsd: 258.65,
						weight: 0.5,
						legNavUsd: 10.67,
						legPnlUsd: 0.67,
						legPnlPct: 6.7,
					},
					{
						symbol: "GOOG",
						targetBps: 5000,
						priceAtDepositUsd: 168.9,
						priceNowUsd: 178.2,
						weight: 0.5,
						legNavUsd: 10.51,
						legPnlUsd: 0.51,
						legPnlPct: 5.1,
					},
				],
				method: "demo-fixture",
				note: "Preview marks for UI review — not live vault NAV.",
			},
		},
	];

	const costBasisUsd = baskets.reduce((sum, b) => sum + b.costBasisUsd, 0);
	const currentNavUsd = baskets.reduce(
		(sum, b) => sum + b.pnl.currentNavUsd,
		0,
	);
	const pnlUsd = currentNavUsd - costBasisUsd;

	return {
		wallet,
		basketCount: baskets.length,
		costBasisUsd,
		currentNavUsd,
		pnlUsd,
		pnlPct: costBasisUsd > 0 ? (pnlUsd / costBasisUsd) * 100 : 0,
		baskets,
	};
}
