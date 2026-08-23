// Shared DIA RWA + on-chain dia-oracle helpers for price scripts.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	Account,
	Contract,
	Keypair,
	Networks,
	nativeToScVal,
	rpc,
	scValToNative,
	TransactionBuilder,
} from "@stellar/stellar-sdk";

export const DIA_BASE = "https://api.diadata.org/v1/rwa";
export const RPC_URL =
	process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
export const NETWORK_PASSPHRASE =
	process.env.NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
export const KEY_NAME = process.env.UPDATER_KEY_NAME || "demo-admin";
export const USDC_PRICE = 100000000n; // $1.00 @ 8 decimals

export const ENDPOINT = {
	Stock: (s) => `Equities/${s}`,
	ETF: (s) => `ETF/${s}`,
	Commodity: (s) => `Commodities/${s}-USD`,
	FX: (s) => `Fiat/${s}-USD`,
};

const CATALOG_PATH = fileURLToPath(
	new URL("../../src/data/rwa-catalog.json", import.meta.url),
);
const DEPLOY_PATHS = [
	fileURLToPath(new URL("../../src/client/stellar/deploy.json", import.meta.url)),
	fileURLToPath(new URL("../.stellar-deploy.json", import.meta.url)),
];

export const to8dec = (x) =>
	Number.isFinite(x) && x > 0 ? BigInt(Math.round(x * 1e8)) : null;

export function loadCatalog() {
	return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
}

export function resolveOracleId() {
	if (process.env.ORACLE_ID) return process.env.ORACLE_ID;
	for (const path of DEPLOY_PATHS) {
		if (!existsSync(path)) continue;
		const j = JSON.parse(readFileSync(path, "utf8"));
		if (j.oracle) return j.oracle;
	}
	return null;
}

/** Normalize NY tickers (GOOGL → GOOG) and look up catalog rows. */
export function resolveAssets(tickers) {
	const catalog = loadCatalog();
	const bySym = new Map(
		catalog.map((a) => [a.symbol.toUpperCase(), a]),
	);
	bySym.set("GOOGL", bySym.get("GOOG") ?? { symbol: "GOOG", name: "Alphabet", type: "Stock" });

	if (!tickers?.length) return catalog;

	const out = [];
	const missing = [];
	for (const raw of tickers) {
		const sym = String(raw).trim().toUpperCase();
		const asset = bySym.get(sym);
		if (!asset) missing.push(sym);
		else out.push(asset);
	}
	if (missing.length) {
		throw new Error(
			`unknown NY ticker(s): ${missing.join(", ")}. Use symbols from src/data/rwa-catalog.json`,
		);
	}
	return out;
}

export async function mapLimit(items, limit, fn) {
	const out = new Array(items.length);
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i], i);
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
	return out;
}

export async function fetchDiaSpot(asset) {
	const url = `${DIA_BASE}/${ENDPOINT[asset.type](asset.symbol)}`;
	for (let attempt = 1; attempt <= 2; attempt++) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = await res.json();
			const price8 = to8dec(body.Price);
			if (!price8) {
				throw new Error(`bad price: ${JSON.stringify(body).slice(0, 80)}`);
			}
			return {
				symbol: asset.symbol,
				name: asset.name,
				type: asset.type,
				key: `${asset.symbol}/USD`,
				price: Number(body.Price),
				price8,
				timestamp: body.Timestamp ?? null,
				source: url,
			};
		} catch (err) {
			if (attempt === 2) throw err;
			await new Promise((r) => setTimeout(r, 1000));
		}
	}
}

export async function collectDiaPrices(assets, { concurrency = 8 } = {}) {
	const failed = [];
	const fetched = await mapLimit(assets, concurrency, async (asset) => {
		try {
			return await fetchDiaSpot(asset);
		} catch (err) {
			failed.push(`${asset.symbol}: ${err.message}`);
			return null;
		}
	});
	const entries = fetched.filter(Boolean);
	return { entries, failed };
}

function scvU128(n) {
	return nativeToScVal(BigInt(n), { type: "u128" });
}

export async function readOnChainPrice(oracleId, key) {
	const server = new rpc.Server(RPC_URL);
	const contract = new Contract(oracleId);
	// Simulation needs a source account; any funded pubkey works for read-only.
	const sourceKey =
		process.env.UPDATER_SECRET ||
		(() => {
			try {
				return execFileSync("stellar", ["keys", "secret", KEY_NAME], {
					stdio: ["ignore", "pipe", "inherit"],
				})
					.toString()
					.trim();
			} catch {
				return null;
			}
		})();

	let account;
	if (sourceKey) {
		account = await server.getAccount(Keypair.fromSecret(sourceKey).publicKey());
	} else {
		// Sequence-0 placeholder is enough for a read-only simulate.
		account = new Account(
			"GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
			"0",
		);
	}

	const tx = new TransactionBuilder(account, {
		fee: "100000",
		networkPassphrase: NETWORK_PASSPHRASE,
	})
		.addOperation(contract.call("read_oracle_value", nativeToScVal(key)))
		.setTimeout(30)
		.build();

	const simulated = await server.simulateTransaction(tx);
	if (simulated.error) throw new Error(`simulate failed: ${simulated.error}`);
	const retval = simulated.result?.retval;
	if (!retval) throw new Error("no retval from read_oracle_value");
	const native = scValToNative(retval);
	// OracleValue is (price u128, updated_at u128)
	const price8 = BigInt(native[0] ?? native.price ?? 0);
	const updatedAt = BigInt(native[1] ?? native.updated_at ?? 0);
	return {
		key,
		price8,
		price: Number(price8) / 1e8,
		updatedAt: Number(updatedAt),
		updatedAtIso:
			updatedAt > 0n ? new Date(Number(updatedAt) * 1000).toISOString() : null,
	};
}

export function buildSetPricesOp(oracleId, entries) {
	const contract = new Contract(oracleId);
	const keysArg = nativeToScVal(entries.map((e) => e.key));
	const now = BigInt(Math.floor(Date.now() / 1000));
	const valuesArg = nativeToScVal(
		entries.map((e) =>
			nativeToScVal([scvU128(e.price8 ?? e.price), scvU128(now)]),
		),
	);
	return contract.call("set_prices", keysArg, valuesArg);
}

export async function pushPrices(oracleId, entries) {
	const secret =
		process.env.UPDATER_SECRET ||
		execFileSync("stellar", ["keys", "secret", KEY_NAME], {
			stdio: ["ignore", "pipe", "inherit"],
		})
			.toString()
			.trim();
	const kp = Keypair.fromSecret(secret);
	const server = new rpc.Server(RPC_URL);

	const source = await server.getAccount(kp.publicKey());
	const tx = new TransactionBuilder(source, {
		fee: "2000000",
		networkPassphrase: NETWORK_PASSPHRASE,
	})
		.addOperation(buildSetPricesOp(oracleId, entries))
		.setTimeout(120)
		.build();

	const simulated = await server.simulateTransaction(tx);
	if (simulated.error) throw new Error(`simulate failed: ${simulated.error}`);
	const assembled = rpc.assembleTransaction(tx, simulated).build();
	assembled.sign(kp);

	let sent = await server.sendTransaction(assembled);
	const txHash = sent.hash ?? sent.txHash;
	if (!txHash) {
		throw new Error(`send rejected: ${JSON.stringify(sent)}`);
	}
	const deadline = Date.now() + 60000;
	while (
		(sent.status === "PENDING" || sent.status === "NOT_FOUND") &&
		Date.now() < deadline
	) {
		await new Promise((r) => setTimeout(r, 2000));
		sent = await server.getTransaction(txHash);
	}
	if (sent.status !== "SUCCESS") {
		throw new Error(
			`tx ${sent.status}: ${JSON.stringify(sent.result_xdr ?? txHash)}`,
		);
	}
	return txHash;
}
