#!/usr/bin/env node
// Push DIA RWA prices into the on-chain dia-oracle (set_prices).
//
//   node scripts/update-oracle-feeds.mjs                    # full catalog + USDC
//   node scripts/update-oracle-feeds.mjs AAPL NVDA SPY      # NY tickers only
//   node scripts/update-oracle-feeds.mjs --stocks           # all Stock entries
//   node scripts/update-oracle-feeds.mjs --dry-run
//   node scripts/update-oracle-feeds.mjs --watch            # loop every PRICE_INTERVAL_MS
//
// Env:
//   ORACLE_ID          dia-oracle contract id (or deploy.json / .stellar-deploy.json)
//   UPDATER_KEY_NAME   stellar CLI key (default: demo-admin)
//   UPDATER_SECRET     raw S... secret; overrides keystore
//   NETWORK            testnet | mainnet (default testnet)
//   PRICE_INTERVAL_MS  watch interval (default 300000)

import {
	collectDiaPrices,
	pushPrices,
	resolveAssets,
	resolveOracleId,
	USDC_PRICE,
} from "./lib/oracle-feeds.mjs";

const INTERVAL_MS = Number(process.env.PRICE_INTERVAL_MS || 300000);

function usage() {
	console.log(`Usage:
  node scripts/update-oracle-feeds.mjs [TICKER...]
  node scripts/update-oracle-feeds.mjs --stocks
  node scripts/update-oracle-feeds.mjs --dry-run
  node scripts/update-oracle-feeds.mjs --watch

Mirrors https://api.diadata.org/v1/rwa/* into dia-oracle set_prices.
On-chain keys are "<SYM>/USD" with 8-decimal USD prices.`);
}

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const tickers = args.filter((a) => !a.startsWith("--"));

if (flags.has("--help") || flags.has("-h")) {
	usage();
	process.exit(0);
}

const dryRun = flags.has("--dry-run");
const watch = flags.has("--watch");
const stocksOnly = flags.has("--stocks");

function pickAssets() {
	if (stocksOnly) return resolveAssets().filter((a) => a.type === "Stock");
	if (tickers.length) return resolveAssets(tickers);
	return resolveAssets();
}

async function once() {
	const started = Date.now();
	const assets = pickAssets();
	const { entries, failed } = await collectDiaPrices(assets);

	const partialOk = tickers.length > 0 || stocksOnly;
	if (!partialOk && entries.length < assets.length / 2) {
		throw new Error(
			`only ${entries.length}/${assets.length} feeds available; refusing to write partial market`,
		);
	}
	if (!entries.length) {
		throw new Error(`no feeds fetched${failed.length ? `: ${failed.join("; ")}` : ""}`);
	}

	const payload = [
		...entries.map((e) => ({ key: e.key, price8: e.price8, usd: e.price })),
		{ key: "USDC/USD", price8: USDC_PRICE, usd: 1 },
	];

	console.log(
		`${new Date().toISOString()} ${entries.length}/${assets.length} feeds ok` +
			(failed.length ? `; failed: ${failed.join("; ")}` : ""),
	);

	if (dryRun) {
		for (const e of payload) {
			console.log(
				`  ${e.key.padEnd(14)} ${(Number(e.price8) / 1e8).toFixed(4)} USD`,
			);
		}
		return;
	}

	const oracleId = resolveOracleId();
	if (!oracleId) {
		throw new Error(
			"ORACLE_ID not set and no oracle in deploy.json / .stellar-deploy.json",
		);
	}
	const hash = await pushPrices(oracleId, payload);
	console.log(
		`on-chain update ok (${payload.length} feeds) oracle=${oracleId} tx=${hash}`,
	);
	console.log(`cycle took ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

if (watch) {
	for (;;) {
		try {
			await once();
		} catch (err) {
			console.error(`update failed: ${err.message}`);
		}
		await new Promise((r) => setTimeout(r, INTERVAL_MS));
	}
} else {
	await once();
}
