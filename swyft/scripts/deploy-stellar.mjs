// One-shot Stellar testnet bring-up for investmade.fun contracts.
// Idempotent: every step caches its result in scripts/.stellar-deploy.json,
// reruns skip finished steps (delete that file to redo from scratch).
//
//   node scripts/deploy-stellar.mjs                  # full bring-up (all catalog assets)
//   node scripts/deploy-stellar.mjs --assets AAPL,NVDA,SPY,XAU   # subset of pools
//   node scripts/deploy-stellar.mjs --skip-prices    # skip the price-updater cycle
//
// What it does:
//   1. ensures demo-admin / demo-usdc-issuer keys (generated + friendbot-funded)
//   2. deploys dia-oracle.wasm (constructor admin = demo-admin)
//   3. runs one scripts/price-updater.mjs cycle against it
//   4. deploys a DEMOUSD SAC (mock USDC stand-in, issuer = demo-usdc-issuer)
//   5. deploys bucket-vault.wasm + initialize(...72h staleness, 2% drift)
//   6. per asset: deploys an 8-dec token (share_token.wasm reused), mints to
//      admin, approves vault, seeds an internal pool sized at oracle price
//   7. creates two example buckets ("Magnificent Seven", "Hard Assets")
//   8. writes the summary back into .stellar-deploy.json

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
	Account,
	Address,
	Contract,
	Keypair,
	Networks,
	nativeToScVal,
	rpc,
	TransactionBuilder,
} from "@stellar/stellar-sdk";

const NETWORK = ["--network", process.env.NETWORK || "testnet"];
const WASM_DIR = fileURLToPath(new URL("../contracts/target/wasm32v1-none/release", import.meta.url));
const STATE_FILE = fileURLToPath(new URL("./.stellar-deploy.json", import.meta.url));
const STATE = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};

const POOL_USD = 25_000; // notional per internal pool
const USDC_MINT = "500000000000000"; // 50M DEMOUSD @ 7 dec — free testnet money
const STALENESS_SECS = "259200"; // 72h: stocks stop ticking on weekends
const DRIFT_BPS = "200";

/// SAC bounds live_until to [cur_ledger, cur_ledger + 3110400]; aim ~170 days.
async function approvalExpiry() {
	const res = await fetch("https://soroban-testnet.stellar.org", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestLedger" }),
	});
	const { result } = await res.json();
	return String(result.sequence + 3_000_000);
}

const sh = (args, { quiet, network = true } = {}) => {
	const argv = [...args];
	if (network) {
		// must precede "--" or the CLI eats it as a constructor arg
		argv.splice(argv.indexOf("--") === -1 ? argv.length : argv.indexOf("--"), 0, ...NETWORK);
	}
	try {
		return execFileSync("stellar", argv, {
			stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"],
		}).toString().trim();
	} catch (err) {
		throw new Error(
			`stellar ${argv.slice(0, 4).join(" ")}… failed:\n${err.stderr || err.message}`,
		);
	}
};

const save = () => writeFileSync(STATE_FILE, JSON.stringify(STATE, null, 2));

async function ensureKey(name) {
	try {
		return sh(["keys", "address", name], { quiet: true, network: false });
	} catch {
		sh(["keys", "generate", name], { quiet: true, network: false });
	}
	const addr = sh(["keys", "address", name], { quiet: true, network: false });
	console.log(`funding ${name} ${addr}...`);
	const res = await fetch(`https://friendbot.stellar.org?addr=${addr}`);
	if (!res.ok) throw new Error(`friendbot ${res.status} for ${addr}`);
	await res.text();
	return addr;
}

/// Always upload the CURRENT file bytes and deploy by explicit hash — the CLI
/// silently reuses a stale previously-installed build when given --wasm.
function deploy(wasmFile, source, ctorArgs = []) {
	const hash = sh([
		"contract", "install",
		"--wasm", path.join(WASM_DIR, wasmFile),
		"--source-account", source,
	], { quiet: true });
	return sh([
		"contract", "deploy",
		"--wasm-hash", hash,
		"--source-account", source,
		"--", ...ctorArgs.map((a, i) => (i % 2 === 0 ? `--${a}` : a)),
	], { quiet: true });
}

function installHash(wasmFile, source) {
	return sh([
		"contract", "install",
		"--wasm", path.join(WASM_DIR, wasmFile),
		"--source-account", source,
	], { quiet: true });
}

function invoke(id, source, fnName, args = []) {
	return sh([
		"contract", "invoke",
		"--id", id,
		"--source-account", source,
		"--fee", "1000000",
		"--", fnName, ...args.flatMap(([k, v]) => [`--${k}`, v]),
	], { quiet: true });
}

async function diaPrice(asset) {
	const url =
		asset.type === "Stock" ? `Equities/${asset.symbol}` :
		asset.type === "ETF" ? `ETF/${asset.symbol}` :
		asset.type === "Commodity" ? `Commodities/${asset.symbol}-USD` :
		`Fiat/${asset.symbol}-USD`;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const res = await fetch(`https://api.diadata.org/v1/rwa/${url}`, { signal: AbortSignal.timeout(15000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = await res.json();
			return Number.isFinite(body.Price) && body.Price > 0 ? body.Price : null;
		} catch {
			if (attempt === 3) return null;
			await new Promise((r) => setTimeout(r, 1500));
		}
	}
}

// ---------- steps ----------

console.log("== keys");
STATE.admin = STATE.admin || (await ensureKey("demo-admin"));
STATE.usdcIssuer = STATE.usdcIssuer || (await ensureKey("demo-usdc-issuer"));
save();
console.log(`admin=${STATE.admin}\nissuer=${STATE.usdcIssuer}`);

if (!STATE.oracle) {
	console.log("\n== dia-oracle");
	STATE.oracle = deploy("dia_oracle.wasm", "demo-admin", ["admin", STATE.admin]);
	save();
}
console.log(`oracle=${STATE.oracle}`);

if (!process.argv.includes("--skip-prices")) {
	console.log("\n== prices");
	execFileSync("node", [
		fileURLToPath(new URL("./price-updater.mjs", import.meta.url)),
	], { stdio: "inherit", env: { ...process.env, ORACLE_ID: STATE.oracle } });
	save();
}

if (!STATE.usdc) {
	console.log("\n== mock USDC (DEMOUSD SAC)");
	STATE.usdc = sh([
		"contract", "asset", "deploy",
		"--asset", `DEMOUSD:${STATE.usdcIssuer}`,
		"--source-account", "demo-usdc-issuer",
	], { quiet: true });
	save();
}
console.log(`usdc=${STATE.usdc}`);

if (!STATE.trustline) {
	sh(["tx", "new", "change-trust", "--line", `DEMOUSD:${STATE.usdcIssuer}`, "--source-account", "demo-admin"], { quiet: true });
	STATE.trustline = true;
	save();
}

if (!STATE.mintedUsdc) {
	invoke(STATE.usdc, "demo-usdc-issuer", "mint", [["to", STATE.admin], ["amount", USDC_MINT]]);
	STATE.mintedUsdc = true;
	save();
}

if (!STATE.vault) {
	console.log("\n== bucket-vault");
	STATE.shareWasmHash = STATE.shareWasmHash || installHash("share_token.wasm", "demo-admin");
	STATE.vault = deploy("bucket_vault.wasm", "demo-admin");
	save();
}
if (!STATE.initialized) {
	invoke(STATE.vault, "demo-admin", "initialize", [
		["admin", STATE.admin],
		["usdc", STATE.usdc],
		["usdc_key", '"USDC/USD"'],
		["dia_oracle", STATE.oracle],
		["share_token_wasm", STATE.shareWasmHash],
		["staleness_secs", STALENESS_SECS],
		["drift_bps", DRIFT_BPS],
	]);
	STATE.initialized = true;
	save();
}
console.log(`vault=${STATE.vault}`);

// ponytail: demo seeds a curated top-30 (all have live DIA feeds); pass
// --assets SYM,SYM to override or --assets ALL for the full catalog.
const DEFAULT_ASSETS = [
	// mega-cap stocks
	"AAPL", "MSFT", "NVDA", "GOOG", "AMZN", "META", "TSLA", "AMD", "NFLX", "DIS",
	"JPM", "V", "KO", "WMT", "XOM", "JNJ", "ORCL", "PG",
	// ETFs
	"SPY", "QQQ", "VOO", "IVV", "IBIT", "TLT",
	// commodities
	"XAU", "XAGG", "WTI", "NG",
	// FX
	"EUR", "JPY",
];

const assetsArgIdx = process.argv.indexOf("--assets");
const wanted = assetsArgIdx > -1
	? process.argv[assetsArgIdx + 1].split(",").filter((s) => s !== "ALL")
	: DEFAULT_ASSETS;

const catalog = JSON.parse(
	readFileSync(fileURLToPath(new URL("../src/data/rwa-catalog.json", import.meta.url)), "utf8"),
);
const selected = wanted.includes("ALL") || assetsArgIdx > -1 && wanted.length === 0
	? catalog
	: catalog.filter((a) => wanted.includes(a.symbol));
console.log(`\n== tokens+pools (${selected.length} assets)`);
const expiryLedger = await approvalExpiry();

// Phase 1 (CLI, sequential): ensure token contracts + mints exist.
// Phase 2 (SDK, pipelined): approve+seed everything remaining in parallel.
const needSeeding = [];
for (const asset of selected) {
	const sym = asset.symbol;
	STATE.tokens = STATE.tokens || {};
	if (!STATE.tokens[sym]) {
		const name = asset.name.replace(/"/g, "");
		STATE.tokens[sym] = deploy("share_token.wasm", "demo-admin", [
			"admin", STATE.admin,
			"name", `"${name}"`,
			"symbol", `"${sym}"`,
		]);
		save();
	}
	if (STATE.seeded?.[sym]) {
		console.log(`${sym}: already seeded`);
		continue;
	}
	if (!STATE.minted?.[sym]) {
		const usd = await diaPrice(asset);
		if (!usd) {
			console.log(`${sym}: no DIA feed, skipped`);
			continue;
		}
		(STATE.prices = STATE.prices || {})[sym] = usd;
		const units = BigInt(Math.ceil(((POOL_USD * 2) / usd) * 1e8)).toString();
		invoke(STATE.tokens[sym], "demo-admin", "mint", [["to", STATE.admin], ["amount", units]]);
		(STATE.minted = STATE.minted || {})[sym] = true;
		save();
	}
	needSeeding.push(asset);
}

if (needSeeding.length) {
	console.log(`pipelining approve+seed for ${needSeeding.length} assets...`);
	const failures = await pipelineSeed(needSeeding, expiryLedger);
	for (const asset of needSeeding.filter((a) => !failures.has(a.symbol))) {
		(STATE.seeded = STATE.seeded || {})[asset.symbol] = true;
		console.log(`${asset.symbol}: pool seeded (${usdLabel(STATE.prices[asset.symbol])})`);
	}
	save();
	if (failures.size) {
		console.error(`FAILED (${failures.size}): ${[...failures].join(", ")} — rerun to retry`);
		process.exitCode = 1;
	}
}

const seeded = [...selected].filter((a) => STATE.seeded?.[a.symbol]).length;
console.log(`${seeded}/${selected.length} pools ready`);

/// Build all approve+seed txs up front with preallocated sequence numbers,
/// then fire chunks concurrently. Turns ~6s/tx CLI spawns into ~6s/12txs.
async function pipelineSeed(assets, expiryLedger) {
	const server = new rpc.Server(process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org");
	const kp = Keypair.fromSecret(sh(["keys", "secret", "demo-admin"], { quiet: true, network: false }).trim());
	const acc = await server.getAccount(kp.publicKey());

	const A = (s) => new Address(s).toScVal();
	const i128 = (n) => nativeToScVal(BigInt(n), { type: "i128" });
	const u32 = (n) => nativeToScVal(n, { type: "u32" });

	const ops = [
		["usdc-approve", STATE.usdc, "approve",
			[A(STATE.admin), A(STATE.vault), i128("100000000000000"), u32(expiryLedger)]],
	];
	for (const a of assets) {
		const usd = await diaPrice(a);
		if (!usd) {
			console.log(`${a.symbol}: no DIA feed, skipped`);
			continue;
		}
		(STATE.prices = STATE.prices || {})[a.symbol] = usd;
		const assetAmt = BigInt(Math.round((POOL_USD / usd) * 1e8)).toString();
		ops.push([`${a.symbol}-approve`, STATE.tokens[a.symbol], "approve",
			[A(STATE.admin), A(STATE.vault), i128(assetAmt), u32(expiryLedger)]]);
		ops.push([`${a.symbol}-seed`, STATE.vault, "seed_pool",
			[A(STATE.tokens[a.symbol]), i128(String(BigInt(POOL_USD) * 10_000_000n)), i128(assetAmt)]]);
	}

	let seq = BigInt(acc.sequence);
	const built = [];
	for (const entry of ops) {
		const account = new Account(kp.publicKey(), seq.toString());
		seq += 1n;
		const tx = new TransactionBuilder(account, { fee: "2000000", networkPassphrase: Networks.TESTNET })
			.addOperation(new Contract(entry[1]).call(entry[2], ...entry[3]))
			.setTimeout(180)
			.build();
		tx.sign(kp);
		built.push({ entry, tx });
	}

	const failures = new Set();
	const CHUNK = 12;
	for (let i = 0; i < built.length; i += CHUNK) {
		const results = await Promise.allSettled(
			built.slice(i, i + CHUNK).map(async ({ entry, tx }) => {
				let sent = await server.sendTransaction(tx);
				if (!sent.hash) throw new Error(JSON.stringify(sent));
				let s = sent;
				const deadline = Date.now() + 90000;
				while ((s.status === "PENDING" || s.status === "NOT_FOUND") && Date.now() < deadline) {
					await new Promise((r) => setTimeout(r, 1500));
					s = await server.getTransaction(sent.hash);
				}
				if (s.status !== "SUCCESS") throw new Error(`${s.status}`);
			}),
		);
		results.forEach((r, j) => {
			const [label] = built[i + j].entry;
			if (r.status === "rejected") {
				console.error(`  ${label}: ${String(r.reason?.message ?? r.reason).slice(0, 140)}`);
				failures.add(label.split("-")[0]);
			}
		});
	}
	return failures;
}

if (!STATE.buckets) {
	console.log("\n== example buckets");
	const allocs = (symbols, bpsEach) =>
		"[" +
		symbols
			.map((s) => `{"asset":"${STATE.tokens[s]}","dia_key":"${s}/USD","target_bps":${bpsEach}}`)
			.join(",") +
		"]";
	const mag7 = ["AAPL", "MSFT", "GOOG", "AMZN", "NVDA", "META", "TSLA"];
	const hard = ["XAU", "XAGG", "WTI"];
	const ready = mag7.every((s) => STATE.tokens[s]) && hard.every((s) => STATE.tokens[s]);
	if (!ready) {
		console.log("subset run without all bucket tokens; skipping example buckets");
	} else {
		invoke(STATE.vault, "demo-admin", "create_bucket", [
			["name", '"Magnificent Seven"'],
			["allocations", allocs(mag7, 1400)],
		]);
		invoke(STATE.vault, "demo-admin", "create_bucket", [
			["name", '"Hard Assets"'],
			["allocations", allocs(hard, 3400)],
		]);
	}
	STATE.buckets = { mag7: 0, hardAssets: 1 };
	save();
}

console.log("\n== deployment complete");
console.log(JSON.stringify({
	oracle: STATE.oracle,
	usdc: STATE.usdc,
	vault: STATE.vault,
	admin: STATE.admin,
	buckets: STATE.buckets,
}, null, 2));

function usdLabel(p) {
	return `$${p >= 1000 ? Math.round(p).toLocaleString() : p.toFixed(2)}`;
}
