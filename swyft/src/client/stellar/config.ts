import deploy from "./deploy.json";

export type StellarDeployConfig = {
	admin: string;
	oracle: string;
	usdc: string;
	vault: string;
	shareWasmHash: string;
	tokens: Record<string, string>;
	prices?: Record<string, number>;
};

export const STELLAR_RPC_URL =
	import.meta.env.VITE_STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";

export const STELLAR_NETWORK_PASSPHRASE =
	import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE ??
	"Test SDF Network ; September 2015";

/** Live testnet deployment from scripts/.stellar-deploy.json */
export const stellarConfig = deploy as StellarDeployConfig;

/** DEMOUSD / vault USDC uses 7 decimals (Stellar asset contract). */
export const USDC_DECIMALS = 7;

export function stellarTokenAddress(symbol: string): string | undefined {
	const key = symbol.toUpperCase();
	const aliased = key === "GOOGL" ? "GOOG" : key;
	return stellarConfig.tokens[aliased];
}

export function hasStellarToken(symbol: string): boolean {
	return Boolean(stellarTokenAddress(symbol));
}

export function explorerTxUrl(hash: string): string {
	return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

export function explorerContractUrl(id: string): string {
	return `https://stellar.expert/explorer/testnet/contract/${id}`;
}
