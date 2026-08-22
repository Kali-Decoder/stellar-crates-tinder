import { Networks } from "@creit.tech/stellar-wallets-kit";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import type { SwkAppTheme } from "@creit.tech/stellar-wallets-kit/types";
import { SwkAppLightTheme } from "@creit.tech/stellar-wallets-kit/types";

const WALLET_ID_KEY = "swyft:stellar-wallet-id";
const isBrowser = typeof window !== "undefined";

/** Swyft.fun theme mapped onto Stellar Wallets Kit modal tokens. */
export const swyftSwkTheme: SwkAppTheme = {
	...SwkAppLightTheme,
	background: "#ffffff",
	"background-secondary": "#e8eef5",
	"foreground-strong": "#071018",
	foreground: "#071018",
	"foreground-secondary": "#5c6675",
	primary: "#1aaa84",
	"primary-foreground": "#041018",
	transparent: "transparent",
	lighter: "#f4f8fc",
	light: "#e8eef5",
	"light-gray": "#c5ced9",
	gray: "#5c6675",
	danger: "#ff5c52",
	border: "#c5ced9",
	shadow: "0 10px 30px rgba(15, 23, 34, 0.08)",
	"border-radius": "16px",
	"font-family": '"DM Sans", system-ui, sans-serif',
};

let initialized = false;

function ensureKitDomSupport() {
	if (!isBrowser) return;
	if (!document.querySelector("style[data-library]")) {
		const style = document.createElement("style");
		style.setAttribute("data-library", "");
		document.head.appendChild(style);
	}
	for (const [key, value] of Object.entries(swyftSwkTheme)) {
		document.documentElement.style.setProperty(`--swk-${key}`, value);
	}
}

export function initStellarKit() {
	if (!isBrowser) return;
	ensureKitDomSupport();
	if (initialized) {
		StellarWalletsKit.setTheme(swyftSwkTheme);
		return;
	}
	try {
		StellarWalletsKit.init({
			network: Networks.TESTNET,
			modules: defaultModules(),
			theme: swyftSwkTheme,
			authModal: {
				showInstallLabel: true,
				hideUnsupportedWallets: false,
			},
		});
		initialized = true;
	} catch (error) {
		initialized = false;
		console.error("Failed to initialize Stellar Wallets Kit:", error);
		throw error;
	}
}

export function isValidStellarPublicKey(publicKey: string): boolean {
	return /^G[A-Z0-9]{55}$/.test(publicKey);
}

export async function connectStellarWallet(): Promise<{
	address: string;
	walletId: string;
}> {
	if (!isBrowser) {
		throw new Error("Wallet connection is only supported in the browser.");
	}
	initStellarKit();
	ensureKitDomSupport();
	StellarWalletsKit.setTheme(swyftSwkTheme);

	// Warm wallet availability before the modal paints so the list is not stuck empty.
	try {
		await StellarWalletsKit.refreshSupportedWallets();
	} catch (error) {
		console.warn("Could not preflight supported wallets:", error);
	}

	const result = await StellarWalletsKit.authModal();
	const address = result.address;
	if (!isValidStellarPublicKey(address)) {
		throw new Error("Invalid Stellar public key returned by the connected wallet.");
	}

	const walletId =
		StellarWalletsKit.selectedModule?.productId ||
		localStorage.getItem(WALLET_ID_KEY) ||
		"freighter";
	localStorage.setItem(WALLET_ID_KEY, walletId);
	return { address, walletId };
}

export async function disconnectStellarWallet(): Promise<void> {
	if (!isBrowser) return;
	try {
		initStellarKit();
		StellarWalletsKit.disconnect();
	} catch (error) {
		console.warn("Stellar disconnect error:", error);
	}
	localStorage.removeItem(WALLET_ID_KEY);
}

export async function restoreStellarWallet(): Promise<string | undefined> {
	if (!isBrowser) return undefined;
	const lastWalletId = localStorage.getItem(WALLET_ID_KEY);
	if (!lastWalletId) return undefined;

	try {
		initStellarKit();
		StellarWalletsKit.setWallet(lastWalletId);
		const { address } = await StellarWalletsKit.fetchAddress();
		if (address && isValidStellarPublicKey(address)) return address;
		localStorage.removeItem(WALLET_ID_KEY);
	} catch (error) {
		console.warn("Silent Stellar auto-reconnect failed:", error);
		localStorage.removeItem(WALLET_ID_KEY);
	}
	return undefined;
}

export function shortStellarAddress(address: string) {
	if (address.length < 12) return address;
	return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
