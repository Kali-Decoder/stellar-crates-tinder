#!/usr/bin/env node
// Fetch DIA RWA spot prices (and optionally on-chain dia-oracle feeds) by NY ticker.
//
//   node scripts/fetch-oracle-price.mjs AAPL
//   node scripts/fetch-oracle-price.mjs AAPL NVDA SPY
//   node scripts/fetch-oracle-price.mjs --stocks          # all Stock catalog entries
//   node scripts/fetch-oracle-price.mjs AAPL --on-chain   # also read deployed oracle
//   node scripts/fetch-oracle-price.mjs AAPL --json
//
// Env:
//   ORACLE_ID   dia-oracle contract id (optional; falls back to deploy.json)

import {
	collectDiaPrices,
	readOnChainPrice,
	resolveAssets,
	resolveOracleId,
} from "./lib/oracle-feeds.mjs";

function usage() {
	console.log(`Usage:
  node scripts/fetch-oracle-price.mjs <TICKER> [TICKER...]
  node scripts/fetch-oracle-price.mjs --stocks
  node scripts/fetch-oracle-price.mjs AAPL --on-chain
  node scripts/fetch-oracle-price.mjs AAPL NVDA --json

NY tickers map to DIA Equities feeds (AAPL → Equities/AAPL → on-chain key AAPL/USD).`);
}

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const tickers = args.filter((a) => !a.startsWith("--"));

if (flags.has("--help") || flags.has("-h")) {
	usage();
	process.exit(0);
}

let assets;
if (flags.has("--stocks")) {
	assets = resolveAssets().filter((a) => a.type === "Stock");
} else if (tickers.length) {
	assets = resolveAssets(tickers);
} else {
	usage();
	process.exit(1);
}

const { entries, failed } = await collectDiaPrices(assets);
const onChain = flags.has("--on-chain");
const oracleId = onChain ? resolveOracleId() : null;
if (onChain && !oracleId) {
	console.error("ORACLE_ID not set and no oracle in deploy.json / .stellar-deploy.json");
	process.exit(1);
}

const rows = [];
for (const e of entries) {
	const row = {
		ticker: e.symbol,
		name: e.name,
		type: e.type,
		diaKey: e.key,
		diaUsd: e.price,
		diaPrice8: e.price8.toString(),
		diaTimestamp: e.timestamp,
		source: e.source,
	};
	if (onChain) {
		try {
			const chain = await readOnChainPrice(oracleId, e.key);
			row.onChainUsd = chain.price;
			row.onChainPrice8 = chain.price8.toString();
			row.onChainUpdatedAt = chain.updatedAtIso;
			row.deltaUsd =
				chain.price8 > 0n ? Number(e.price8 - chain.price8) / 1e8 : null;
		} catch (err) {
			row.onChainError = err.message;
		}
	}
	rows.push(row);
}

if (flags.has("--json")) {
	console.log(JSON.stringify({ oracleId, feeds: rows, failed }, null, 2));
} else {
	if (onChain) console.log(`oracle=${oracleId}`);
	for (const r of rows) {
		const line = `${r.ticker.padEnd(6)} ${r.diaUsd.toFixed(4).padStart(12)} USD  key=${r.diaKey}`;
		if (onChain && r.onChainUsd != null) {
			console.log(
				`${line}  on-chain=${r.onChainUsd.toFixed(4)}  Δ=${(r.deltaUsd ?? 0).toFixed(4)}  updated=${r.onChainUpdatedAt ?? "—"}`,
			);
		} else if (r.onChainError) {
			console.log(`${line}  on-chain error: ${r.onChainError}`);
		} else {
			console.log(line);
		}
	}
	if (failed.length) {
		console.error(`failed (${failed.length}): ${failed.join("; ")}`);
		process.exitCode = 1;
	}
}
