import type { ReactNode } from "react";

/** Minimal stubs so mock builds never load real Privy peers. */
export function PrivyProvider({ children }: { children?: ReactNode }) {
	return children ?? null;
}

export function usePrivy() {
	return {
		ready: true,
		authenticated: false,
		user: null,
		login: async () => undefined,
		logout: async () => undefined,
		getAccessToken: async () => null,
	};
}

export function useWallets() {
	return { wallets: [], ready: true };
}

export function useSignTransaction() {
	return { signTransaction: async () => undefined };
}

export function useCreateWallet() {
	return { createWallet: async () => undefined };
}

export function useSmartWallets() {
	return { client: undefined, getClientForChain: async () => undefined };
}

export function SmartWalletsProvider({ children }: { children?: ReactNode }) {
	return children ?? null;
}

export function toSolanaWalletConnectors() {
	return [];
}

export function UserPill() {
	return null;
}

export type ConnectedWallet = { address: string };
export type ConnectedStandardSolanaWallet = {
	address: string;
	standardWallet?: { name?: string };
};

export default {};
