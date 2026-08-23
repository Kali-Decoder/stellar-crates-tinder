import { Account, Contract, Networks, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { scValToNative } from "@stellar/stellar-sdk";
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
	const [wholeRaw, fracRaw = ""] = value.split(".");
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
