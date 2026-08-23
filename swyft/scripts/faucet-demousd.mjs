#!/usr/bin/env node
// Mint testnet DEMOUSD to a Freighter (or any) G… address.
//
//   node scripts/faucet-demousd.mjs GABCDEF…           # mint 1,000 DEMOUSD
//   node scripts/faucet-demousd.mjs GABCDEF… 5000      # custom amount
//   node scripts/faucet-demousd.mjs GABCDEF… --friendbot  # also fund XLM
//
// Requires Stellar CLI identities: demo-usdc-issuer (and optionally demo-admin).
// Reads USDC contract id from scripts/.stellar-deploy.json or src/client/stellar/deploy.json.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const NETWORK = ["--network", process.env.NETWORK || "testnet"];
const DEFAULT_AMOUNT = "10000000000"; // 1,000 DEMOUSD @ 7 decimals

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

console.log(`minting ${(Number(amount) / 1e7).toFixed(2)} DEMOUSD → ${wallet}`);
console.log(`usdc=${usdc}`);

sh([
	"contract",
	"invoke",
	"--id",
	usdc,
	"--source-account",
	"demo-usdc-issuer",
	...NETWORK,
	"--",
	"mint",
	"--to",
	wallet,
	"--amount",
	amount,
]);

console.log("faucet ok");
