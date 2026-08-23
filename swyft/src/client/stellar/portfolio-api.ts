import { stellarConfig } from "./config";
import { fetchDiaSpot } from "./dia-api";
import type { VaultAllocation } from "./vault";

export type StellarBasketRecord = {
	id: string;
	ownerWallet: string;
	bucketId: number;
	vaultAddress: string;
	name: string;
	status: "active" | "closed";
	allocations: Array<{
		symbol: string;
		asset: string;
		diaKey: string;
		targetBps: number;
		priceAtDepositUsd: number;
	}>;
	costBasisUsd: number;
	sharesOutstanding: string;
	createTxHash: string;
	approveTxHash: string;
	depositTxHash: string;
	ledger: Array<{
		kind: "deposit" | "withdraw";
		usdAmount: number;
		shares: string;
		txHash: string;
		at: string;
	}>;
	createdAt: string;
	updatedAt: string;
};

export type BasketPnlPayload = {
	costBasisUsd: number;
	currentNavUsd: number;
	pnlUsd: number;
	pnlPct: number;
	marks: Array<{
		symbol: string;
		targetBps: number;
		priceAtDepositUsd: number;
		priceNowUsd: number;
		weight: number;
		legNavUsd: number;
		legPnlUsd: number;
		legPnlPct: number;
	}>;
	method: string;
	note: string;
};

export type WalletPortfolioPayload = {
	wallet: string;
	basketCount: number;
	costBasisUsd: number;
	currentNavUsd: number;
	pnlUsd: number;
	pnlPct: number;
	baskets: Array<StellarBasketRecord & { pnl: BasketPnlPayload }>;
};

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		...init,
		headers: {
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
	});
	const body = (await response.json().catch(() => ({}))) as T & {
		error?: unknown;
	};
	if (!response.ok) {
		const detail =
			typeof (body as { detail?: unknown }).detail === "string"
				? String((body as { detail: string }).detail)
				: "";
		const message =
			typeof body.error === "string" ? body.error : `Portfolio API ${response.status}`;
		throw new Error(detail ? `${message}: ${detail.slice(0, 280)}` : message);
	}
	return body;
}

/** Persist a newly created on-chain bucket (one owner per basket). */
export async function recordStellarBasket(input: {
	ownerWallet: string;
	bucketId: number;
	name: string;
	allocations: VaultAllocation[];
	depositUsd: number;
	shares: string;
	createTxHash: string;
	approveTxHash: string;
	depositTxHash: string;
}): Promise<StellarBasketRecord> {
	const allocations = await Promise.all(
		input.allocations.map(async (leg) => {
			let priceAtDepositUsd = 1;
			try {
				const spot = await fetchDiaSpot(leg.symbol);
				if (spot?.price && spot.price > 0) priceAtDepositUsd = spot.price;
			} catch {
				priceAtDepositUsd = 1;
			}
			return {
				symbol: leg.symbol,
				asset: leg.asset,
				diaKey: leg.diaKey,
				targetBps: leg.targetBps,
				priceAtDepositUsd,
			};
		}),
	);

	return jsonFetch<StellarBasketRecord>("/api/stellar/baskets", {
		method: "POST",
		body: JSON.stringify({
			ownerWallet: input.ownerWallet,
			bucketId: input.bucketId,
			vaultAddress: stellarConfig.vault,
			name: input.name,
			allocations,
			depositUsd: input.depositUsd,
			shares: input.shares,
			createTxHash: input.createTxHash,
			approveTxHash: input.approveTxHash,
			depositTxHash: input.depositTxHash,
		}),
	});
}

export function listStellarBaskets(wallet: string, status?: "active" | "closed") {
	const query = new URLSearchParams({ wallet });
	if (status) query.set("status", status);
	return jsonFetch<{ wallet: string; baskets: StellarBasketRecord[] }>(
		`/api/stellar/baskets?${query}`,
	);
}

export function getStellarBasket(id: string) {
	return jsonFetch<StellarBasketRecord>(`/api/stellar/baskets/${id}`);
}

export function getStellarBasketPnl(id: string) {
	return jsonFetch<{ basket: StellarBasketRecord; pnl: BasketPnlPayload }>(
		`/api/stellar/baskets/${id}/pnl`,
	);
}

export function getWalletPortfolio(wallet: string) {
	return jsonFetch<WalletPortfolioPayload>(
		`/api/stellar/wallets/${encodeURIComponent(wallet)}/portfolio`,
	);
}

/** Testnet DEMOUSD mint via portfolio API → Stellar CLI issuer. */
export function requestDemoUsdFaucet(params: {
	wallet: string;
	amountUsd?: number;
	friendbot?: boolean;
}) {
	return jsonFetch<{ ok: boolean; amountUsd: number }>(
		"/api/stellar/faucet",
		{
			method: "POST",
			body: JSON.stringify({
				wallet: params.wallet,
				amountUsd: params.amountUsd ?? 1000,
				friendbot: params.friendbot ?? true,
			}),
		},
	);
}
