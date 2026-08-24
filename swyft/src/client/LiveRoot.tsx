import { useEffect, useState } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import {
	createSolanaRpc,
	createSolanaRpcSubscriptions,
} from "@solana/kit";
import { defineChain } from "viem";
import { App } from "./App";
import { api, type PublicConfig } from "./api";
import { LicenseGate } from "./components/LicenseModal";

const robinhoodChain = defineChain({
	id: 4663,
	name: "Robinhood Chain",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: {
		default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
	},
	blockExplorers: {
		default: {
			name: "Robinhood Chain Explorer",
			url: "https://explorer.chain.robinhood.com",
		},
	},
});

/** Legacy Privy / Robinhood / Solana app — loaded only when mock UI is off. */
export function LiveRoot() {
	const [config, setConfig] = useState<PublicConfig>();
	const [error, setError] = useState("");

	useEffect(() => {
		api
			.config()
			.then(setConfig)
			.catch((caught) =>
				setError(
					caught instanceof Error
						? caught.message
						: "Could not load app configuration",
				),
			);
	}, []);

	if (error) {
		return (
			<main className="fatal-state">
				<h1>swyft.fun is unavailable</h1>
				<p>{error}</p>
			</main>
		);
	}
	if (!config) {
		return (
			<main className="loading-state page-loader">
				<span />
				<h1>Loading swyft.fun</h1>
			</main>
		);
	}

	return (
		<PrivyProvider
			appId={config.privy.appId}
			config={{
				loginMethods: ["email", "wallet"],
				appearance: {
					theme: "light",
					accentColor: "#baff00",
					walletChainType: "ethereum-and-solana",
					walletList: [
						"rainbow",
						"metamask",
						"coinbase_wallet",
						"detected_ethereum_wallets",
						"phantom",
						"solflare",
						"backpack",
						"jupiter",
						"detected_solana_wallets",
						"wallet_connect_qr_solana",
					],
				},
				externalWallets: {
					solana: {
						connectors: toSolanaWalletConnectors({ shouldAutoConnect: false }),
					},
				},
				supportedChains: [robinhoodChain],
				embeddedWallets: {
					ethereum: { createOnLogin: "all-users" },
					solana: { createOnLogin: "all-users" },
				},
				solana: {
					rpcs: {
						"solana:mainnet": {
							rpc: createSolanaRpc(`${window.location.origin}/api/solana/rpc`),
							rpcSubscriptions: createSolanaRpcSubscriptions(
								"wss://api.mainnet-beta.solana.com",
							),
							blockExplorerUrl: "https://explorer.solana.com",
						},
					},
				},
			}}
		>
			<SmartWalletsProvider>
				<LicenseGate>
					<App config={config} />
				</LicenseGate>
			</SmartWalletsProvider>
		</PrivyProvider>
	);
}
