/**
 * Ambient typings for @creit.tech/stellar-wallets-kit.
 * Package 2.5.x ships broken .d.ts re-exports that point at a missing `src/` tree.
 */
declare module "@creit.tech/stellar-wallets-kit" {
	export { Networks } from "@creit.tech/stellar-wallets-kit/types";
}

declare module "@creit.tech/stellar-wallets-kit/types" {
	export enum Networks {
		PUBLIC = "Public Global Stellar Network ; September 2015",
		TESTNET = "Test SDF Network ; September 2015",
		FUTURENET = "Test SDF Future Network ; October 2022",
		SANDBOX = "Local Sandbox Stellar Network ; September 2022",
		STANDALONE = "Standalone Network ; February 2017",
	}

	export type SwkAppTheme = Record<string, string>;
	export const SwkAppLightTheme: SwkAppTheme;
	export const SwkAppDarkTheme: SwkAppTheme;

	export interface ModuleInterface {
		productId: string;
		productName: string;
		moduleType: string;
		isAvailable(): Promise<boolean>;
		getAddress(params?: { path?: string }): Promise<{ address: string }>;
		signTransaction(
			xdr: string,
			opts?: { networkPassphrase?: string; address?: string },
		): Promise<{ signedTxXdr: string; signerAddress?: string }>;
	}

	export interface StellarWalletsKitInitParams {
		network: Networks | string;
		modules: ModuleInterface[];
		theme?: SwkAppTheme;
		authModal?: {
			showInstallLabel?: boolean;
			hideUnsupportedWallets?: boolean;
		};
	}
}

declare module "@creit.tech/stellar-wallets-kit/sdk" {
	import type {
		ModuleInterface,
		StellarWalletsKitInitParams,
		SwkAppTheme,
	} from "@creit.tech/stellar-wallets-kit/types";

	export class StellarWalletsKit {
		static init(params: StellarWalletsKitInitParams): void;
		static setTheme(theme: SwkAppTheme): void;
		static setWallet(walletId: string): void;
		static disconnect(): void;
		static refreshSupportedWallets(): Promise<void>;
		static authModal(): Promise<{ address: string }>;
		static fetchAddress(): Promise<{ address: string }>;
		static get selectedModule(): ModuleInterface | undefined;
		static signTransaction(
			xdr: string,
			opts?: { networkPassphrase?: string; address?: string },
		): Promise<{ signedTxXdr: string; signerAddress?: string }>;
	}
}

declare module "@creit.tech/stellar-wallets-kit/modules/utils" {
	import type { ModuleInterface } from "@creit.tech/stellar-wallets-kit/types";
	export function defaultModules(): ModuleInterface[];
}
