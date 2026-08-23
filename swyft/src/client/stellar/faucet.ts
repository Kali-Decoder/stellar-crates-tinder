import {
	Asset,
	Horizon,
	Networks,
	Operation,
	TransactionBuilder,
} from "@stellar/stellar-sdk";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import {
	STELLAR_HORIZON_URL,
	STELLAR_NETWORK_PASSPHRASE,
	stellarConfig,
} from "./config";
import { initStellarKit } from "./kit";
import { requestDemoUsdFaucet } from "./portfolio-api";

const DEMO_ASSET_CODE = "DEMOUSD";

function horizonServer() {
	return new Horizon.Server(STELLAR_HORIZON_URL);
}

function demoAsset() {
	const issuer = stellarConfig.usdcIssuer;
	if (!issuer) {
		throw new Error("deploy.json missing usdcIssuer — redeploy / sync config");
	}
	return new Asset(DEMO_ASSET_CODE, issuer);
}

/** True when the classic account already trusts DEMOUSD. */
export async function hasDemoUsdTrustline(wallet: string): Promise<boolean> {
	try {
		const account = await horizonServer().loadAccount(wallet);
		const issuer = stellarConfig.usdcIssuer;
		return account.balances.some(
			(b) =>
				b.asset_type !== "native" &&
				"asset_code" in b &&
				b.asset_code === DEMO_ASSET_CODE &&
				b.asset_issuer === issuer,
		);
	} catch {
		return false;
	}
}

/** Friendbot XLM so the account can pay fees / exist on testnet. */
export async function fundWithFriendbot(wallet: string): Promise<void> {
	const res = await fetch(
		`https://friendbot.stellar.org?addr=${encodeURIComponent(wallet)}`,
	);
	if (!res.ok && res.status !== 400) {
		throw new Error(`Friendbot failed (${res.status})`);
	}
}

/**
 * Ask Freighter to open a DEMOUSD trustline (required before SAC mint).
 * No-ops if the trustline already exists.
 */
export async function ensureDemoUsdTrustline(wallet: string): Promise<{
	needed: boolean;
	hash?: string;
}> {
	if (await hasDemoUsdTrustline(wallet)) {
		return { needed: false };
	}

	initStellarKit();
	const horizon = horizonServer();
	const passphrase = STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
	const account = await horizon.loadAccount(wallet);
	const tx = new TransactionBuilder(account, {
		fee: "100000",
		networkPassphrase: passphrase,
	})
		.addOperation(Operation.changeTrust({ asset: demoAsset() }))
		.setTimeout(180)
		.build();

	const { signedTxXdr } = await StellarWalletsKit.signTransaction(tx.toXDR(), {
		networkPassphrase: passphrase,
		address: wallet,
	});
	const signed = TransactionBuilder.fromXDR(signedTxXdr, passphrase);
	const result = await horizon.submitTransaction(signed);
	return {
		needed: true,
		hash: result.hash,
	};
}

/**
 * Full faucet flow for the connected Freighter wallet:
 * Friendbot → DEMOUSD trustline (user signs) → issuer mint via API.
 */
export async function claimTestnetDemoUsd(params: {
	wallet: string;
	amountUsd?: number;
	onPhase?: (message: string) => void;
}): Promise<{ amountUsd: number }> {
	const { wallet, amountUsd = 1000, onPhase } = params;
	onPhase?.("Funding XLM via Friendbot…");
	await fundWithFriendbot(wallet);

	onPhase?.("Approve DEMOUSD trustline in Freighter…");
	await ensureDemoUsdTrustline(wallet);

	onPhase?.("Minting DEMOUSD…");
	const minted = await requestDemoUsdFaucet({
		wallet,
		amountUsd,
		friendbot: false,
	});
	return { amountUsd: minted.amountUsd };
}
