import { Account, Contract, Networks, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { nativeToScVal, scValToNative } from "@stellar/stellar-sdk";
import {
	STELLAR_HORIZON_URL,
	USDC_DECIMALS,
	XLM_DECIMALS,
	hasStellarToken,
	stellarCanonicalSymbol,
	stellarConfig,
	stellarTokenAddress,
} from "./config";
import {
	addressScVal,
	allocationScVal,
	getRpcServer,
	i128ScVal,
	invokeContract,
	stringScVal,
	u32ScVal,
} from "./rpc";
import { fetchDiaSpot } from "./dia-api";

export type VaultAllocation = {
	symbol: string;
	asset: string;
	diaKey: string;
	targetBps: number;
};

export type InvestBasketResult = {
	bucketId: number;
	shares: string;
	createHash: string;
	approveHash: string;
	depositHash: string;
	amountBaseUnits: string;
};

/** Equal-weight allocations for symbols that exist on the deployed vault. */
export function buildAllocationsFromSymbols(symbols: string[]): VaultAllocation[] {
	const unique = [
		...new Set(
			symbols
				.map((s) => stellarCanonicalSymbol(s))
				.filter(hasStellarToken),
		),
	];
	if (!unique.length) {
		throw new Error(
			"None of the selected assets are deployed on Stellar testnet yet.",
		);
	}
	const base = Math.floor(10_000 / unique.length);
	let remainder = 10_000 - base * unique.length;
	return unique.map((symbol) => {
		const bps = base + (remainder > 0 ? 1 : 0);
		if (remainder > 0) remainder -= 1;
		const asset = stellarTokenAddress(symbol);
		if (!asset) throw new Error(`Missing token for ${symbol}`);
		return {
			symbol,
			asset,
			diaKey: `${symbol}/USD`,
			targetBps: bps,
		};
	});
}

export function usdToUsdcBaseUnits(usd: number): bigint {
	return BigInt(Math.round(usd * 10 ** USDC_DECIMALS));
}

/** Classic DEMOUSD trustline balance from Horizon (7 decimals). */
async function readClassicDemoUsdBalance(owner: string): Promise<bigint> {
	const issuer = stellarConfig.usdcIssuer;
	if (!owner || !issuer) return 0n;
	try {
		const response = await fetch(
			`${STELLAR_HORIZON_URL}/accounts/${encodeURIComponent(owner)}`,
		);
		if (response.status === 404) return 0n;
		if (!response.ok) return 0n;
		const data = (await response.json()) as {
			balances?: Array<{
				asset_type: string;
				asset_code?: string;
				asset_issuer?: string;
				balance: string;
			}>;
		};
		const line = data.balances?.find(
			(entry) =>
				entry.asset_code === "DEMOUSD" && entry.asset_issuer === issuer,
		);
		if (!line?.balance) return 0n;
		return parseStellarAmount(line.balance, USDC_DECIMALS);
	} catch {
		return 0n;
	}
}

export async function readUsdcBalance(owner: string): Promise<bigint> {
	const [sac, classic] = await Promise.all([
		readTokenBalance(stellarConfig.usdc, owner),
		readClassicDemoUsdBalance(owner),
	]);
	// Prefer SAC; fall back to Horizon trustline (more reliable right after faucet).
	return sac > 0n ? sac : classic;
}

/** Native XLM balance in stroops (7 decimals) from Horizon. */
export async function readXlmBalance(owner: string): Promise<bigint> {
	if (!owner) return 0n;
	try {
		const response = await fetch(
			`${STELLAR_HORIZON_URL}/accounts/${encodeURIComponent(owner)}`,
		);
		if (response.status === 404) return 0n;
		if (!response.ok) return 0n;
		const data = (await response.json()) as {
			balances?: Array<{ asset_type: string; balance: string }>;
		};
		const native = data.balances?.find(
			(entry) => entry.asset_type === "native",
		);
		if (!native?.balance) return 0n;
		return parseStellarAmount(native.balance, XLM_DECIMALS);
	} catch {
		return 0n;
	}
}

export async function readWalletBalances(owner: string): Promise<{
	usdcBaseUnits: bigint;
	xlmBaseUnits: bigint;
}> {
	const [usdcBaseUnits, xlmBaseUnits] = await Promise.all([
		readUsdcBalance(owner),
		readXlmBalance(owner),
	]);
	return { usdcBaseUnits, xlmBaseUnits };
}

function parseStellarAmount(value: string, decimals: number): bigint {
	const [wholeRaw = "0", fracRaw = ""] = value.split(".");
	const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
	const frac = `${fracRaw}${"0".repeat(decimals)}`.slice(0, decimals);
	return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

async function readTokenBalance(tokenId: string, owner: string): Promise<bigint> {
	const server = getRpcServer();
	try {
		const funded = await server.getAccount(owner);
		const built = new TransactionBuilder(funded, {
			fee: "100",
			networkPassphrase: Networks.TESTNET,
		})
			.addOperation(new Contract(tokenId).call("balance", addressScVal(owner)))
			.setTimeout(30)
			.build();
		const sim = await server.simulateTransaction(built);
		if ("result" in sim && sim.result?.retval) {
			return BigInt(scValToNative(sim.result.retval));
		}
	} catch {
		try {
			const account = new Account(owner, "0");
			const built = new TransactionBuilder(account, {
				fee: "100",
				networkPassphrase: Networks.TESTNET,
			})
				.addOperation(
					new Contract(tokenId).call("balance", addressScVal(owner)),
				)
				.setTimeout(30)
				.build();
			const sim = await server.simulateTransaction(built);
			if ("result" in sim && sim.result?.retval) {
				return BigInt(scValToNative(sim.result.retval));
			}
		} catch {
			return 0n;
		}
	}
	return 0n;
}

export async function createBucket(params: {
	source: string;
	name: string;
	allocations: VaultAllocation[];
}): Promise<{ bucketId: number; hash: string }> {
	const allocVec = xdr.ScVal.scvVec(
		params.allocations.map((a) =>
			allocationScVal({
				asset: a.asset,
				diaKey: a.diaKey,
				targetBps: a.targetBps,
			}),
		),
	);

	const { hash, returnValue } = await invokeContract<number | string>({
		contractId: stellarConfig.vault,
		method: "create_bucket",
		args: [stringScVal(params.name), allocVec],
		source: params.source,
		fee: "6000000",
	});

	const bucketId = Number(returnValue);
	if (!Number.isFinite(bucketId)) {
		throw new Error(`Unexpected create_bucket return: ${String(returnValue)}`);
	}
	return { bucketId, hash };
}

export async function approveUsdc(params: {
	source: string;
	amount: bigint;
	expirationLedger: number;
}): Promise<{ hash: string }> {
	const { hash } = await invokeContract({
		contractId: stellarConfig.usdc,
		method: "approve",
		args: [
			addressScVal(params.source),
			addressScVal(stellarConfig.vault),
			i128ScVal(params.amount),
			u32ScVal(params.expirationLedger),
		],
		source: params.source,
	});
	return { hash };
}

export async function depositUsdc(params: {
	source: string;
	bucketId: number;
	amount: bigint;
}): Promise<{ hash: string; shares: string }> {
	const { hash, returnValue } = await invokeContract<number | string | bigint>({
		contractId: stellarConfig.vault,
		method: "deposit",
		args: [
			u32ScVal(params.bucketId),
			addressScVal(params.source),
			i128ScVal(params.amount),
		],
		source: params.source,
	});
	return { hash, shares: String(returnValue ?? "0") };
}

export async function getLatestLedger(): Promise<number> {
	const server = getRpcServer();
	const info = await server.getLatestLedger();
	return info.sequence;
}

/** Simulate a read-only contract call without a wallet signature. */
async function viewCall<R>(
	contractId: string,
	method: string,
	args: xdr.ScVal[] = [],
): Promise<R | undefined> {
	const server = getRpcServer();
	try {
		const account = new Account(stellarConfig.admin, "0");
		const built = new TransactionBuilder(account, {
			fee: "100",
			networkPassphrase: Networks.TESTNET,
		})
			.addOperation(new Contract(contractId).call(method, ...args))
			.setTimeout(30)
			.build();
		const sim = await server.simulateTransaction(built);
		if ("result" in sim && sim.result?.retval !== undefined) {
			return scValToNative(sim.result.retval) as R;
		}
	} catch {
		return undefined;
	}
	return undefined;
}

export type VaultBucketLeg = {
	asset: string;
	diaKey: string;
	symbol: string;
	targetBps: number;
};

export type VaultBucket = {
	id: number;
	name: string;
	shareToken: string;
	allocations: VaultBucketLeg[];
};

type RawBucket = {
	id: number | string;
	name: string;
	share_token: string;
	allocations: Array<{ asset: string; dia_key: string; target_bps: number }>;
};

export async function getBucket(bucketId: number): Promise<VaultBucket> {
	const raw = await viewCall<RawBucket>(
		stellarConfig.vault,
		"get_bucket",
		[u32ScVal(bucketId)],
	);
	if (!raw?.share_token) throw new Error(`Bucket #${bucketId} not found on-chain`);
	return {
		id: Number(raw.id),
		name: String(raw.name ?? ""),
		shareToken: raw.share_token,
		allocations: (raw.allocations ?? []).map((leg) => ({
			asset: leg.asset,
			diaKey: leg.dia_key,
			symbol: leg.dia_key.split("/")[0] ?? "",
			targetBps: leg.target_bps,
		})),
	};
}

export async function readShareBalance(
	shareToken: string,
	owner: string,
): Promise<bigint> {
	return readTokenBalance(shareToken, owner);
}

export async function readShareSupply(shareToken: string): Promise<bigint> {
	const supply = await viewCall<string | number | bigint>(
		shareToken,
		"total_supply",
	);
	return supply === undefined ? 0n : BigInt(supply);
}

/** Pro-rata payout (asset → base units) for burning `shares`. */
export async function previewWithdraw(
	bucketId: number,
	shares: bigint,
): Promise<Record<string, bigint>> {
	const out = await viewCall<Record<string, string | number>>(
		stellarConfig.vault,
		"preview_withdraw",
		[u32ScVal(bucketId), i128ScVal(shares)],
	);
	const parsed: Record<string, bigint> = {};
	for (const [asset, amount] of Object.entries(out ?? {})) {
		parsed[asset] = BigInt(amount);
	}
	return parsed;
}

export async function withdrawShares(params: {
	source: string;
	bucketId: number;
	shares: bigint;
}): Promise<{ hash: string }> {
	const { hash } = await invokeContract({
		contractId: stellarConfig.vault,
		method: "withdraw",
		args: [
			u32ScVal(params.bucketId),
			addressScVal(params.source),
			i128ScVal(params.shares),
		],
		source: params.source,
		fee: "4000000",
	});
	return { hash };
}

/**
 * Share-token burn goes through OZ burn_from → the vault needs an allowance
 * from the owner before withdraw() can burn their shares.
 */
export async function approveShareSpending(params: {
	source: string;
	shareToken: string;
	amount: bigint;
	expirationLedger: number;
}): Promise<{ hash: string }> {
	const { hash } = await invokeContract({
		contractId: params.shareToken,
		method: "approve",
		args: [
			addressScVal(params.source),
			addressScVal(stellarConfig.vault),
			i128ScVal(params.amount),
			u32ScVal(params.expirationLedger),
		],
		source: params.source,
	});
	return { hash };
}

// ---------- rebalance ----------

const PRICE_SCALE = 10n ** 8n; // 8-dec USD, matches contract
const MIN_TRADE_USD = 10n ** 8n; // $1.00 @ 8dec
export const DRIFT_BPS = 200; // must match deploy DRIFT_BPS
export const REBALANCE_SLIPPAGE_BPS = 100;

export type RebalanceLeg = {
	symbol: string;
	asset: string;
	action: "sell" | "buy" | "hold";
	/** Signed drift in USD (+ overweight / − underweight). */
	driftUsd: number;
	/** Base units of the input token to swap (asset when selling, USDC when buying). */
	tradeAmountBase?: bigint;
	expectedOutBase?: bigint;
	minOutBase?: bigint;
};

export type RebalancePlan = {
	bucketId: number;
	totalUsd: number;
	minOuts: string[];
	legs: RebalanceLeg[];
	needed: boolean;
};

function usdValue(amount: bigint, price8: bigint, decimals: number): bigint {
	return (amount * price8) / 10n ** BigInt(decimals);
}

/** Mirror of the contract's rebalance loop, off-chain, for preview + min_outs. */
export async function planRebalance(bucketId: number): Promise<RebalancePlan> {
	const bucket = await getBucket(bucketId);
	const holdings =
		(await viewCall<Record<string, string | number>>(
			stellarConfig.vault,
			"holdings",
			[u32ScVal(bucketId)],
		)) ?? {};
	const heldOf = (asset: string) => BigInt(holdings[asset] ?? 0);

	const prices = new Map<string, bigint>();
	const decimals = new Map<string, number>();
	await Promise.all(
		bucket.allocations.map(async (leg) => {
			let price8 = 0n;
			try {
				const spot = await fetchDiaSpot(leg.symbol);
				if (spot?.price && spot.price > 0) {
					price8 = BigInt(Math.round(spot.price * 1e8));
				}
			} catch {
				price8 = 0n;
			}
			prices.set(leg.asset, price8);
			const dec = await viewCall<string | number>(leg.asset, "decimals");
			decimals.set(leg.asset, dec === undefined ? 8 : Number(dec));
		}),
	);

	const idleUsdc = heldOf(stellarConfig.usdc);
	let total = usdValue(idleUsdc, 10n ** 8n, USDC_DECIMALS);
	for (const leg of bucket.allocations) {
		const price8 = prices.get(leg.asset) ?? 0n;
		if (!price8) continue;
		total += usdValue(heldOf(leg.asset), price8, decimals.get(leg.asset) ?? 8);
	}
	if (total <= 0n) {
		return { bucketId, totalUsd: 0, minOuts: [], legs: [], needed: false };
	}

	const driftFloor = (total * BigInt(DRIFT_BPS)) / 10_000n;
	const legs: RebalanceLeg[] = [];
	const minOuts: string[] = [];

	for (const leg of bucket.allocations) {
		const price8 = prices.get(leg.asset) ?? 0n;
		const dec = decimals.get(leg.asset) ?? 8;
		const held = heldOf(leg.asset);
		if (!price8) {
			minOuts.push("0");
			legs.push({ symbol: leg.symbol, asset: leg.asset, action: "hold", driftUsd: 0 });
			continue;
		}

		const cur = usdValue(held, price8, dec);
		const target = (total * BigInt(leg.targetBps)) / 10_000n;
		const diffAbs = target > cur ? target - cur : cur - target;
		const overweight = cur > target;
		if (diffAbs <= driftFloor || diffAbs < MIN_TRADE_USD) {
			minOuts.push("0");
			legs.push({
				symbol: leg.symbol,
				asset: leg.asset,
				action: "hold",
				driftUsd: Number(cur - target) / 1e8,
			});
			continue;
		}

		const pool =
			(await viewCall<{ usdc_res: string | number; asset_res: string | number }>(
				stellarConfig.vault,
				"get_pool",
				[addressScVal(leg.asset)],
			)) ?? { usdc_res: 0, asset_res: 0 };
		const [resIn, resOut] = overweight
			? [BigInt(pool.asset_res), BigInt(pool.usdc_res)]
			: [BigInt(pool.usdc_res), BigInt(pool.asset_res)];
		if (resIn <= 0n || resOut <= 0n) {
			minOuts.push("0");
			legs.push({
				symbol: leg.symbol,
				asset: leg.asset,
				action: "hold",
				driftUsd: Number(cur - target) / 1e8,
			});
			continue;
		}

		const tradeAmount = overweight
			? ((diffAbs * 10n ** BigInt(dec)) / price8) > held
				? held
				: ((diffAbs * 10n ** BigInt(dec)) / price8)
			: ((diffAbs * 10n ** BigInt(USDC_DECIMALS)) / PRICE_SCALE) > idleUsdc
				? idleUsdc
				: ((diffAbs * 10n ** BigInt(USDC_DECIMALS)) / PRICE_SCALE);
		if (tradeAmount <= 0n) {
			minOuts.push("0");
			legs.push({
				symbol: leg.symbol,
				asset: leg.asset,
				action: "hold",
				driftUsd: Number(cur - target) / 1e8,
			});
			continue;
		}

		const expectedOut = (tradeAmount * resOut) / (resIn + tradeAmount);
		const minOut = (expectedOut * (10_000n - BigInt(REBALANCE_SLIPPAGE_BPS))) / 10_000n;

		minOuts.push(minOut.toString());
		legs.push({
			symbol: leg.symbol,
			asset: leg.asset,
			action: overweight ? "sell" : "buy",
			driftUsd: Number(cur - target) / 1e8,
			tradeAmountBase: tradeAmount,
			expectedOutBase: expectedOut,
			minOutBase: minOut,
		});
	}

	return {
		bucketId,
		totalUsd: Number(total) / 1e8,
		minOuts,
		legs,
		needed: legs.some((leg) => leg.action !== "hold"),
	};
}

/**
 * Keeper-style rebalance: permissionless on-chain — min_outs bound execution.
 * One Freighter signature from the owner.
 */
export async function rebalanceBucket(params: {
	source: string;
	bucketId: number;
	slippageBps?: number;
}): Promise<{ hash: string; plan: RebalancePlan }> {
	const plan = await planRebalance(params.bucketId);
	const slippageBps = params.slippageBps ?? REBALANCE_SLIPPAGE_BPS;
	const deadline = Math.floor(Date.now() / 1000) + 300;
	const { hash } = await invokeContract({
		contractId: stellarConfig.vault,
		method: "rebalance",
		args: [
			u32ScVal(params.bucketId),
			nativeToScVal(BigInt(deadline), { type: "u64" }),
			u32ScVal(slippageBps),
			xdr.ScVal.scvVec(plan.minOuts.map((out) => i128ScVal(BigInt(out)))),
		],
		source: params.source,
		fee: "8000000",
	});
	return { hash, plan };
}

/**
 * Full invest path: create_bucket → approve USDC → deposit.
 */
export async function investBasket(params: {
	source: string;
	name: string;
	symbols: string[];
	usdAmount: number;
	onPhase?: (phase: string) => void;
}): Promise<InvestBasketResult> {
	const allocations = buildAllocationsFromSymbols(params.symbols);
	const amount = usdToUsdcBaseUnits(params.usdAmount);
	if (amount <= 0n) throw new Error("Deposit amount must be positive.");

	params.onPhase?.("Creating on-chain basket…");
	const created = await createBucket({
		source: params.source,
		name: params.name.slice(0, 64),
		allocations,
	});

	params.onPhase?.("Approving USDC…");
	const ledger = await getLatestLedger();
	const approved = await approveUsdc({
		source: params.source,
		amount,
		expirationLedger: ledger + 20_000,
	});

	params.onPhase?.("Depositing USDC…");
	const deposited = await depositUsdc({
		source: params.source,
		bucketId: created.bucketId,
		amount,
	});

	return {
		bucketId: created.bucketId,
		shares: deposited.shares,
		createHash: created.hash,
		approveHash: approved.hash,
		depositHash: deposited.hash,
		amountBaseUnits: amount.toString(),
	};
}

export { stellarConfig, hasStellarToken, stellarTokenAddress };
