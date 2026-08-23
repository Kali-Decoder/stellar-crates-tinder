import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const FAUCET_SCRIPT = fileURLToPath(
	new URL("../../swyft/scripts/faucet-demousd.mjs", import.meta.url),
);

/** Testnet DEMOUSD mint via Stellar CLI (demo-usdc-issuer). */
export async function runDemoUsdFaucet(input: {
	wallet: string;
	amountUsd?: number;
	friendbot?: boolean;
}): Promise<{ status: number; body: unknown }> {
	const wallet = String(input.wallet ?? "").trim();
	if (!/^G[A-Z0-9]{55}$/.test(wallet)) {
		return { status: 400, body: { error: "invalid stellar address" } };
	}
	const amount =
		input.amountUsd && Number.isFinite(input.amountUsd) && input.amountUsd > 0
			? String(input.amountUsd)
			: "1000";
	const args = [FAUCET_SCRIPT, wallet, amount];
	if (input.friendbot) args.push("--friendbot");

	const result = await new Promise<{
		code: number | null;
		stdout: string;
		stderr: string;
	}>((resolve) => {
		const child = spawn(process.execPath, args, {
			cwd: path.dirname(FAUCET_SCRIPT),
			env: process.env,
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		child.on("close", (code) => resolve({ code, stdout, stderr }));
	});

	if (result.code !== 0) {
		return {
			status: 502,
			body: {
				error: "faucet mint failed",
				detail: (result.stderr || result.stdout).slice(0, 800),
			},
		};
	}

	return {
		status: 200,
		body: {
			ok: true,
			wallet,
			amountUsd: Number(amount),
			log: result.stdout.trim().slice(-400),
		},
	};
}
