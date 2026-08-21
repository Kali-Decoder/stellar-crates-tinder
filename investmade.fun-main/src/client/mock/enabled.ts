/** Pure client mock UI — no Privy, wallets, or chain calls. */
export function isMockUi(): boolean {
	// Opt into the live Privy/chain app with VITE_LIVE_UI=true
	if (import.meta.env.VITE_LIVE_UI === "true") return false;
	if (import.meta.env.VITE_MOCK_UI === "true") return true;
	if (typeof window === "undefined") return true;
	try {
		const params = new URLSearchParams(window.location.search);
		if (params.get("live") === "1") return false;
		if (params.get("mock") === "0") return false;
		// Default: UI-only fixture flow (no wallet / contracts)
		return true;
	} catch {
		return true;
	}
}

export const MOCK_WALLET = "0xmock00000000000000000000000000000000abcd";
