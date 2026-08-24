#!/usr/bin/env node
// Mint testnet DEMOUSD to a Freighter (or any) G… address.
//
//   node scripts/faucet-demousd.mjs GABCDEF…           # mint 1,000 DEMOUSD
//   node scripts/faucet-demousd.mjs GABCDEF… 5000      # custom amount
//   node scripts/faucet-demousd.mjs GABCDEF… --friendbot  # also fund XLM
//
// Signing source (first match wins):
//   FAUCET_ISSUER_SECRET    — S… secret key
//   FAUCET_ISSUER_MNEMONIC  — 12/24-word seed phrase (must derive to deploy.usdcIssuer)
//   FAUCET_ISSUER_IDENTITY  — Stellar CLI identity name (default: demo-usdc-issuer)
//
// Loads FAUCET_* from ../server/.env or ../.env when not already in the environment.
// Reads USDC contract id from scripts/.stellar-deploy.json or src/client/stellar/deploy.json.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Keypair } from "@stellar/stellar-sdk";

const NETWORK = ["--network", process.env.NETWORK || "testnet"];
const DEFAULT_AMOUNT = "10000000000"; // 1,000 DEMOUSD @ 7 decimals

function loadEnvFiles() {
	const paths = [
		fileURLToPath(new URL("../../server/.env", import.meta.url)),
		fileURLToPath(new URL("../.env", import.meta.url)),
	];
	for (const path of paths) {
		if (!existsSync(path)) continue;
		for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
			const line = raw.trim();
			if (!line || line.startsWith("#")) continue;
			const eq = line.indexOf("=");
			if (eq <= 0) continue;
			const key = line.slice(0, eq).trim();
			if (!key.startsWith("FAUCET_") && key !== "NETWORK") continue;
			// File wins over stale process env (e.g. API started with an old .env).
			let val = line.slice(eq + 1).trim();
			if (
				(val.startsWith('"') && val.endsWith('"')) ||
				(val.startsWith("'") && val.endsWith("'"))
			) {
				val = val.slice(1, -1);
			}
			process.env[key] = val;
		}
	}
}

function loadDeploy() {
	const paths = [
		fileURLToPath(new URL("./.stellar-deploy.json", import.meta.url)),
		fileURLToPath(new URL("../src/client/stellar/deploy.json", import.meta.url)),
	];
	for (const path of paths) {
		if (!existsSync(path)) continue;
		return JSON.parse(readFileSync(path, "utf8"));
	}
	throw new Error("No deploy.json / .stellar-deploy.json found — deploy first");
}

function sh(args) {
	return execFileSync("stellar", args, {
		stdio: ["ignore", "pipe", "inherit"],
	})
		.toString()
		.trim();
}

function pubkeyOfSource(source) {
	if (/^S[A-Z0-9]{55}$/.test(source)) {
		return Keypair.fromSecret(source).publicKey();
	}
	if (/^G[A-Z0-9]{55}$/.test(source)) {
		return source;
	}
	// Seed phrase or CLI identity name
	return execFileSync("stellar", ["keys", "address", source], {
		stdio: ["ignore", "pipe", "pipe"],
	})
		.toString()
		.trim();
}

/**
 * Resolve who signs mint. Must match deploy.usdcIssuer or mint auth fails.
 */
function resolveIssuerSource(expectedIssuer) {
	const secret = process.env.FAUCET_ISSUER_SECRET?.trim();
	const mnemonic = process.env.FAUCET_ISSUER_MNEMONIC?.trim();
	const identity =
		process.env.FAUCET_ISSUER_IDENTITY?.trim() || "demo-usdc-issuer";

	let source;
	let via;
	if (secret) {
		if (!/^S[A-Z0-9]{55}$/.test(secret)) {
			throw new Error("FAUCET_ISSUER_SECRET must be a Stellar S… secret key");
		}
		source = secret;
		via = "FAUCET_ISSUER_SECRET";
	} else if (mnemonic) {
		const words = mnemonic.split(/\s+/).filter(Boolean);
		if (words.length !== 12 && words.length !== 24) {
			throw new Error(
				`FAUCET_ISSUER_MNEMONIC must be 12 or 24 words (got ${words.length})`,
			);
		}
		source = words.join(" ");
		via = "FAUCET_ISSUER_MNEMONIC";
	} else {
		source = identity;
		via = `CLI identity "${identity}"`;
	}

	const pubkey = pubkeyOfSource(source);
	console.log(`issuer source via ${via} → ${pubkey}`);

	if (expectedIssuer && pubkey !== expectedIssuer) {
		const tip =
			"\nIssuer key does not match on-chain DEMOUSD (deploy.usdcIssuer).\n" +
			`  signing as:  ${pubkey}\n` +
			`  required:    ${expectedIssuer}\n` +
			"Faucet mint requires the secret/mnemonic for that issuer address.\n" +
			"Set FAUCET_ISSUER_SECRET=S… (preferred) or FAUCET_ISSUER_MNEMONIC to the key that derives to it.\n" +
			"A deployer/admin seed only works if it is also the DEMOUSD issuer.";
		if (process.env.FAUCET_ALLOW_ISSUER_MISMATCH === "1") {
			console.warn(tip);
			console.warn("FAUCET_ALLOW_ISSUER_MISMATCH=1 — continuing anyway");
		} else {
			throw new Error(tip.trim());
		}
	}

	return { source, pubkey };
}

loadEnvFiles();

const args = process.argv.slice(2).filter((a) => a !== "--");
const friendbot = args.includes("--friendbot");
const positional = args.filter((a) => !a.startsWith("--"));
const wallet = positional[0];
const amountHuman = positional[1];

if (!wallet || !/^G[A-Z0-9]{55}$/.test(wallet)) {
	console.error(
		"Usage: node scripts/faucet-demousd.mjs G…ADDRESS [amountUsd] [--friendbot]",
	);
	process.exit(1);
}

const deploy = loadDeploy();
const usdc = deploy.usdc;
if (!usdc) throw new Error("deploy.usdc missing");
const expectedIssuer = deploy.usdcIssuer;

let amount = DEFAULT_AMOUNT;
if (amountHuman) {
	const n = Number(amountHuman);
	if (!Number.isFinite(n) || n <= 0) {
		console.error("amount must be a positive USD number");
		process.exit(1);
	}
	amount = BigInt(Math.round(n * 1e7)).toString();
}

if (friendbot) {
	console.log(`friendbot ${wallet}…`);
	const res = await fetch(`https://friendbot.stellar.org?addr=${wallet}`);
	if (!res.ok) {
		console.warn(`friendbot ${res.status} (account may already be funded)`);
	} else {
		await res.text();
		console.log("friendbot ok");
	}
}

const { source: issuerSource } = resolveIssuerSource(expectedIssuer);

console.log(`minting ${(Number(amount) / 1e7).toFixed(2)} DEMOUSD → ${wallet}`);
console.log(`usdc=${usdc}`);
console.log(
	"(Recipient must already have a DEMOUSD trustline — the UI opens this via Freighter.)",
);

try {
	sh([
		"contract",
		"invoke",
		"--id",
		usdc,
		"--source-account",
		issuerSource,
		...NETWORK,
		"--",
		"mint",
		"--to",
		wallet,
		"--amount",
		amount,
	]);
} catch (err) {
	const msg = err instanceof Error ? err.message : String(err);
	if (/trustline entry is missing/i.test(msg)) {
		console.error(
			"\nMint failed: wallet has no DEMOUSD trustline.\n" +
				"In the app, use Get testnet DEMOUSD (signs change-trust), or:\n" +
				`  stellar tx new change-trust --line DEMOUSD:${deploy.usdcIssuer} --source-account <YOUR_KEY>`,
		);
	}
	throw err;
}

console.log("faucet ok");
