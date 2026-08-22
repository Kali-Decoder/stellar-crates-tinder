/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_MOCK_UI?: string;
	readonly VITE_LIVE_UI?: string;
	readonly VITE_STELLAR_RPC_URL?: string;
	readonly VITE_STELLAR_NETWORK_PASSPHRASE?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
