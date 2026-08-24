import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
	Contract,
	Keypair,
	Networks,
	TransactionBuilder,
	nativeToScVal,
	rpc,
} from "@stellar/stellar-sdk";

const FAUCET_SCRIPT = fileURLToPath(
	new URL("../../swyft/scripts/faucet-demousd.mjs", import.meta.url),
);
const DEPLOY_JSON_CANDIDATES = [
	fileURLToPath(new URL("../deploy.json", import.meta.url)),
	fileURLToPath(
		new URL("../../swyft/src/client/stellar/deploy.json", import.meta.url),
	),
];

const USDC_DECIMALS = 7;
const DEFAULT_AMOUNT_USD = 1000;

type DeployAddresses = {
	usdc?: string;
	usdcIssuer?: string;
};

function loadDeploy(): DeployAddresses {
	for (const candidate of DEPLOY_JSON_CANDIDATES) {
		if (!existsSync(candidate)) continue;
		try {
			return JSON.parse(readFileSync(candidate, "utf8")) as DeployAddresses;
		} catch {
			/* try next */
		}
	}
	return {};
}

function resolveUsdc() {
	const deploy = loadDeploy();
	const usdc =
		process.env.STELLAR_USDC_CONTRACT?.trim() || deploy.usdc || "";
	const issuer =
		process.env.STELLAR_USDC_ISSUER?.trim() || deploy.usdcIssuer || "";
	return { usdc, issuer };
}

function faucetEnv(): NodeJS.ProcessEnv {
	const homeBin = path.join(homedir(), ".local", "bin");
	const pathParts = (process.env.PATH ?? "").split(path.delimiter);
	if (!pathParts.includes(homeBin)) pathParts.unshift(homeBin);
	return { ...process.env, PATH: pathParts.join(path.delimiter) };
}

async function pollTx(server: rpc.Server, hash: string, timeoutMs = 90_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const latest = await server.getTransaction(hash);
		if (latest.status === "SUCCESS" || latest.status === "FAILED") {
			return latest;
		}
		if (Date.now() > deadline) {
			throw new Error(`Transaction ${hash} timed out (status=${latest.status})`);
		}
		await new Promise((r) => setTimeout(r, 1500));
	}
}

/** Mint via Soroban RPC + FAUCET_ISSUER_SECRET (Render-friendly, no Stellar CLI). */
async function mintWithSdk(input: {
	wallet: string;
	amountUsd: number;
	friendbot?: boolean;
}): Promise<{ status: number; body: unknown }> {
	const secret = process.env.FAUCET_ISSUER_SECRET?.trim();
	if (!secret || !/^S[A-Z0-9]{55}$/.test(secret)) {
		return {
			status: 500,
			body: {
				error: "FAUCET_ISSUER_SECRET missing or invalid (need S… key)",
			},
		};
	}

	const { usdc, issuer } = resolveUsdc();
	if (!usdc) {
		return {
			status: 500,
			body: {
				error:
					"STELLAR_USDC_CONTRACT unset and deploy.json not found — set env on Render",
			},
		};
	}

	const kp = Keypair.fromSecret(secret);
	if (issuer && kp.publicKey() !== issuer) {
		return {
			status: 500,
			body: {
				error: "FAUCET_ISSUER_SECRET does not match STELLAR_USDC_ISSUER / deploy.usdcIssuer",
				signingAs: kp.publicKey(),
				required: issuer,
			},
		};
	}

	if (input.friendbot) {
		try {
			const res = await fetch(
				`https://friendbot.stellar.org?addr=${input.wallet}`,
			);
			if (res.ok) await res.text();
		} catch {
			/* non-fatal — account may already be funded */
		}
	}

	const rpcUrl =
		process.env.STELLAR_RPC_URL?.trim() ||
		"https://soroban-testnet.stellar.org";
	const passphrase =
		process.env.STELLAR_NETWORK_PASSPHRASE?.trim() || Networks.TESTNET;
	const amountRaw = BigInt(
		Math.round(input.amountUsd * 10 ** USDC_DECIMALS),
	);

	try {
		const server = new rpc.Server(rpcUrl, { allowHttp: false });
		// Ensure issuer can pay fees
		try {
			await server.getAccount(kp.publicKey());
		} catch {
			await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
		}

		const account = await server.getAccount(kp.publicKey());
		const contract = new Contract(usdc);
		const built = new TransactionBuilder(account, {
			fee: "2000000",
			networkPassphrase: passphrase,
		})
			.addOperation(
				contract.call(
					"mint",
					nativeToScVal(input.wallet, { type: "address" }),
					nativeToScVal(amountRaw, { type: "i128" }),
				),
			)
			.setTimeout(180)
			.build();

		const simulated = await server.simulateTransaction(built);
		if (rpc.Api.isSimulationError(simulated)) {
			const detail = simulated.error ?? "simulation error";
			const trustlineMissing = /trustline entry is missing/i.test(detail);
			return {
				status: 502,
				body: {
					error: trustlineMissing
						? "USDC trustline required — approve the Freighter trustline prompt, then retry"
						: "faucet mint failed",
					detail: detail.slice(0, 800),
				},
			};
		}

		const prepared = rpc.assembleTransaction(built, simulated).build();
		prepared.sign(kp);
		const sent = await server.sendTransaction(prepared);
		if (sent.status === "ERROR" || !sent.hash) {
			return {
				status: 502,
				body: {
					error: "faucet mint failed",
					detail: JSON.stringify(sent.errorResult ?? sent).slice(0, 800),
				},
			};
		}

		const final = await pollTx(server, sent.hash);
		if (final.status !== "SUCCESS") {
			const detail = JSON.stringify(final).slice(0, 800);
			const trustlineMissing = /trustline entry is missing/i.test(detail);
			return {
				status: 502,
				body: {
					error: trustlineMissing
						? "USDC trustline required — approve the Freighter trustline prompt, then retry"
						: "faucet mint failed",
					detail,
				},
			};
		}

		return {
			status: 200,
			body: {
				ok: true,
				wallet: input.wallet,
				amountUsd: input.amountUsd,
				txHash: sent.hash,
				mode: "sdk",
			},
		};
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		const trustlineMissing = /trustline entry is missing/i.test(detail);
		return {
			status: 502,
			body: {
				error: trustlineMissing
					? "USDC trustline required — approve the Freighter trustline prompt, then retry"
					: "faucet mint failed",
				detail: detail.slice(0, 800),
			},
		};
	}
}

/** Local fallback: Stellar CLI script (needs stellar binary + monorepo paths). */
async function mintWithCli(input: {
	wallet: string;
	amountUsd: number;
	friendbot?: boolean;
}): Promise<{ status: number; body: unknown }> {
	if (!existsSync(FAUCET_SCRIPT)) {
		return {
			status: 500,
			body: {
				error:
					"faucet unavailable — set FAUCET_ISSUER_SECRET for SDK mint (Render), or install Stellar CLI locally",
				detail: FAUCET_SCRIPT,
			},
		};
	}
	const amount = String(input.amountUsd);
	const args = [FAUCET_SCRIPT, input.wallet, amount];
	if (input.friendbot) args.push("--friendbot");

	const result = await new Promise<{
		code: number | null;
		stdout: string;
		stderr: string;
	}>((resolve) => {
		const child = spawn(process.execPath, args, {
			cwd: path.dirname(FAUCET_SCRIPT),
			env: faucetEnv(),
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
		const detail = (result.stderr || result.stdout).slice(0, 800);
		const trustlineMissing = /trustline entry is missing/i.test(detail);
		return {
			status: 502,
			body: {
				error: trustlineMissing
					? "USDC trustline required — approve the Freighter trustline prompt, then retry"
					: "faucet mint failed",
				detail,
			},
		};
	}

	return {
		status: 200,
		body: {
			ok: true,
			wallet: input.wallet,
			amountUsd: input.amountUsd,
			log: result.stdout.trim().slice(-400),
			mode: "cli",
		},
	};
}

/** Testnet DEMOUSD mint — SDK (Render) or Stellar CLI (local). */
export async function runDemoUsdFaucet(input: {
	wallet: string;
	amountUsd?: number;
	friendbot?: boolean;
}): Promise<{ status: number; body: unknown }> {
	const wallet = String(input.wallet ?? "").trim();
	if (!/^G[A-Z0-9]{55}$/.test(wallet)) {
		return { status: 400, body: { error: "invalid stellar address" } };
	}
	const amountUsd =
		input.amountUsd && Number.isFinite(input.amountUsd) && input.amountUsd > 0
			? input.amountUsd
			: DEFAULT_AMOUNT_USD;

	if (process.env.FAUCET_ISSUER_SECRET?.trim()) {
		return mintWithSdk({
			wallet,
			amountUsd,
			friendbot: input.friendbot,
		});
	}

	return mintWithCli({
		wallet,
		amountUsd,
		friendbot: input.friendbot,
	});
}
