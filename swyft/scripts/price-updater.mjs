// Mirrors DIA's RWA REST prices into our on-chain dia-oracle contract (Stellar testnet).
// Prefer the clearer entrypoints:
//   node scripts/fetch-oracle-price.mjs AAPL NVDA
//   node scripts/update-oracle-feeds.mjs [--dry-run] [--watch] [TICKER...]
//
// This file stays as a thin alias so deploy-stellar.mjs / docs keep working.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("./update-oracle-feeds.mjs", import.meta.url));
const child = spawn(process.execPath, [target, ...process.argv.slice(2)], {
	stdio: "inherit",
	env: process.env,
});
child.on("exit", (code, signal) => {
	if (signal) process.kill(process.pid, signal);
	process.exit(code ?? 1);
});
