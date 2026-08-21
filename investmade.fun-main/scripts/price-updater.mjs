// Mirrors DIA's RWA REST prices into our on-chain dia-oracle contract (Stellar testnet).
//
//   node scripts/price-updater.mjs              # one update cycle
//   node scripts/price-updater.mjs --watch      # loop every PRICE_INTERVAL_MS (default 300000)
//   node scripts/price-updater.mjs --dry-run    # fetch + print payload, no chain write
//
// Env:
//   ORACLE_ID          deployed dia-oracle contract id (required unless --dry-run)
//   UPDATER_KEY_NAME   key in stellar CLI keystore (default: demo-admin)
//   UPDATER_SECRET     raw S... secret; overrides keystore lookup
//   NETWORK            default testnet
//
// Feed sources (all public, no API key): https://api.diadata.org/v1/rwa/*
// On-chain keys use "<SYM>/USD"; prices are integer 8-decimal USD like DIA's oracle.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	Contract,
	Keypair,
	Networks,
	nativeToScVal,
	rpc,
	TransactionBuilder,
} from "@stellar/stellar-sdk";

const DIA_BASE = "https://api.diadata.org/v1/rwa";
const RPC_URL =
	process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE =
	process.env.NETWORK === "mainnet"
		? Networks.PUBLIC
		: Networks.TESTNET;
const KEY_NAME = process.env.UPDATER_KEY_NAME || "demo-admin";
const INTERVAL_MS = Number(process.env.PRICE_INTERVAL_MS || 300000);
const FETCH_CONCURRENCY = 8;
const USDC_PRICE = 100000000n; // ponytail: fixed $1; stablecoin, drift irrelevant for demo.

const ENDPOINT = {
	Stock: (s) => `Equities/${s}`,
	ETF: (s) => `ETF/${s}`,
	Commodity: (s) => `Commodities/${s}-USD`,
	FX: (s) => `Fiat/${s}-USD`, // catalog stores base currency only, quote is USD
};

const to8dec = (x) =>
	Number.isFinite(x) && x > 0 ? BigInt(Math.round(x * 1e8)) : null;

async function mapLimit(items, limit, fn) {
	const out = new Array(items.length);
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i], i);
		}
	}
	await Promise.all(Array.from({ length: limit }, worker));
	return out;
}

async function fetchOne(asset) {
	const url = `${DIA_BASE}/${ENDPOINT[asset.type](asset.symbol)}`;
	for (let attempt = 1; attempt <= 2; attempt++) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = await res.json();
			const price = to8dec(body.Price);
			if (!price) throw new Error(`bad price: ${JSON.stringify(body).slice(0, 80)}`);
			return price;
		} catch (err) {
			if (attempt === 2) throw err;
			await new Promise((r) => setTimeout(r, 1000));
		}
	}
}

async function collectPrices() {
	const catalogPath = fileURLToPath(new URL("../src/data/rwa-catalog.json", import.meta.url));
	const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
	const failed = [];
	const fetched = await mapLimit(catalog, FETCH_CONCURRENCY, async (asset) => {
		try {
			return await fetchOne(asset);
		} catch (err) {
			failed.push(`${asset.symbol}: ${err.message}`);
			return null;
		}
	});

	const entries = catalog
		.map((asset, i) =>
			fetched[i] ? { key: `${asset.symbol}/USD`, price: fetched[i] } : null,
		)
		.filter(Boolean);
	if (entries.length < catalog.length / 2) {
		throw new Error(
			`only ${entries.length}/${catalog.length} feeds available; refusing to write partial market`,
		);
	}
	entries.push({ key: "USDC/USD", price: USDC_PRICE });
	return { entries, failed };
}

const scvU128 = (n) => nativeToScVal(BigInt(n), { type: "u128" });

function buildSetPricesOp(entries) {
	const contract = new Contract(process.env.ORACLE_ID);
	const keysArg = nativeToScVal(entries.map((e) => e.key));
	const now = BigInt(Math.floor(Date.now() / 1000));
	const valuesArg = nativeToScVal(
		entries.map((e) => nativeToScVal([scvU128(e.price), scvU128(now)])),
	);
	return contract.call("set_prices", keysArg, valuesArg);
}

async function send(entries) {
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
		.addOperation(buildSetPricesOp(entries))
		.setTimeout(120)
		.build();

	const simulated = await server.simulateTransaction(tx);
	if (simulated.error) throw new Error(`simulate failed: ${simulated.error}`);
	const assembled = rpc.assembleTransaction(tx, simulated).build();
	assembled.sign(kp);

	let sent = await server.sendTransaction(assembled);
	if (!sent.hash) {
		throw new Error(`send rejected: ${JSON.stringify(sent)}`);
	}
	const deadline = Date.now() + 60000;
	while ((sent.status === "PENDING" || sent.status === "NOT_FOUND") && Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 2000));
		sent = await server.getTransaction(sent.hash);
	}
	if (sent.status !== "SUCCESS") {
		throw new Error(`tx ${sent.status}: ${JSON.stringify(sent.result_xdr ?? sent.hash)}`);
	}
	console.log(`on-chain update ok (${entries.length} feeds) tx=${sent.hash}`);
}

async function once(dryRun) {
	const started = Date.now();
	const { entries, failed } = await collectPrices();
	console.log(
		`${new Date().toISOString()} ${entries.length - 1}/${entries.length - 1 + failed.length} feeds ok` +
			(failed.length ? `; failed: ${failed.join("; ")}` : ""),
	);
	if (dryRun) {
		for (const e of entries) console.log(`  ${e.key.padEnd(14)} ${(Number(e.price) / 1e8).toFixed(4)} USD`);
		return;
	}
	await send(entries);
	console.log(`cycle took ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

const dryRun = process.argv.includes("--dry-run");
if (process.argv.includes("--watch")) {
	for (;;) {
		try {
			await once(dryRun);
		} catch (err) {
			console.error(`update failed: ${err.message}`);
		}
		await new Promise((r) => setTimeout(r, INTERVAL_MS));
	}
} else {
	await once(dryRun);
}
