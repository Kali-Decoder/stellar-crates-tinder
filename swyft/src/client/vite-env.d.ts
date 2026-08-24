/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_MOCK_UI?: string;
	readonly VITE_LIVE_UI?: string;
	/** Absolute origin for portfolio API in production, e.g. https://api.example.com */
	readonly VITE_API_BASE_URL?: string;
	readonly VITE_STELLAR_RPC_URL?: string;
	readonly VITE_STELLAR_HORIZON_URL?: string;
	readonly VITE_STELLAR_NETWORK_PASSPHRASE?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare module "*.json" {
	const value: unknown;
	export default value;
}
