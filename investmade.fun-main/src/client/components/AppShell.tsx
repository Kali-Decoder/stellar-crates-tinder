import { type ReactNode, useEffect, useRef, useState } from "react";
import type { ConnectedWallet } from "@privy-io/react-auth";
import type { ConnectedStandardSolanaWallet } from "@privy-io/react-auth/solana";
import { Wallet } from "lucide-react";
import { shortStellarAddress } from "../stellar/kit";
import { ThemeToggle } from "./ThemeToggle";
import { WalletMenu } from "./WalletMenu";

interface Props {
	active: "week" | "positions" | "receipts" | "account";
	onNavigate: (target: Props["active"]) => void;
	wallet?: string;
	fundingWallet?: ConnectedWallet;
	topUpRequest?: number;
	onWallet?: () => void;
	onDisconnect?: () => void;
	walletReady?: boolean;
	walletConnecting?: boolean;
	navigationEnabled?: boolean;
	/** Skip Privy wallet menu; show Stellar / preview address controls. */
	mockMode?: boolean;
	activeChain: "ROBINHOOD" | "SOLANA";
	onChainChange: (chain: "ROBINHOOD" | "SOLANA") => void;
	solanaWallets: ConnectedStandardSolanaWallet[];
	solanaWalletsReady: boolean;
	solanaAvailable: boolean;
	selectedSolanaWallet?: ConnectedStandardSolanaWallet;
	onSolanaWalletChange: (wallet: ConnectedStandardSolanaWallet) => void;
	children: ReactNode;
}

export function AppShell({
	active,
	onNavigate,
	wallet,
	fundingWallet,
	topUpRequest,
	onWallet,
	onDisconnect,
	walletReady = true,
	walletConnecting = false,
	navigationEnabled = true,
	mockMode = false,
	activeChain,
	onChainChange,
	solanaWallets,
	solanaWalletsReady,
	solanaAvailable,
	selectedSolanaWallet,
	onSolanaWalletChange,
	children,
}: Props) {
	useEffect(() => {
		const root = document.documentElement;
		const themeColor = document.querySelector<HTMLMetaElement>(
			'meta[name="theme-color"]',
		);
		const previousChain = root.dataset.chain;
		const previousThemeColor = themeColor?.content;
		const chain = mockMode ? "stellar" : activeChain.toLowerCase();

		root.dataset.chain = chain;
		if (themeColor) {
			const isDark = root.dataset.theme === "dark";
			themeColor.content =
				isDark || (!mockMode && activeChain === "SOLANA")
					? "#0b0e14"
					: "#f1f3f6";
		}

		return () => {
			if (previousChain) root.dataset.chain = previousChain;
			else delete root.dataset.chain;
			if (themeColor && previousThemeColor) themeColor.content = previousThemeColor;
		};
	}, [activeChain, mockMode]);

	return (
		<div className="app-shell">
			<header className={navigationEnabled ? "topbar" : "topbar topbar-onboarding"}>
				<button
					type="button"
					className="brand"
					onClick={() => onNavigate("week")}
					aria-label="swyft.fun home"
				>
					swyft.<span>fun</span>
				</button>
				{navigationEnabled ? (
					<nav aria-label="Primary navigation">
						{[
							["week", "Basket"],
							["positions", "Portfolio"],
							["receipts", "Activity"],
							["account", "Account"],
						].map(([id, label]) => (
							<button
								type="button"
								key={id}
								className={active === id ? "nav-link active" : "nav-link"}
								onClick={() => onNavigate(id as Props["active"])}
							>
								{label}
							</button>
						))}
					</nav>
				) : null}
				<div className="topbar-end">
					<ThemeToggle />
					{wallet ? (
						<div className="wallet-pill">
							{mockMode ? (
								<StellarConnectedPill
									address={wallet}
									onDisconnect={onDisconnect}
								/>
							) : (
								<WalletMenu
									wallet={wallet}
									fundingWallet={fundingWallet}
									topUpRequest={topUpRequest}
									activeChain={activeChain}
									onChainChange={onChainChange}
									solanaWallets={solanaWallets}
									solanaWalletsReady={solanaWalletsReady}
									solanaAvailable={solanaAvailable}
									selectedSolanaWallet={selectedSolanaWallet}
									onSolanaWalletChange={onSolanaWalletChange}
								/>
							)}
						</div>
					) : (
						<button
							type="button"
							className="wallet-button"
							onClick={onWallet}
							disabled={!walletReady || walletConnecting}
							aria-label="Connect Stellar wallet"
							title="Connect Stellar wallet"
						>
						<Wallet size={17} strokeWidth={1.7} />
						{walletConnecting ? (
							"Connecting…"
						) : (
							<>
								<span className="wallet-label-full">Connect Stellar wallet</span>
								<span className="wallet-label-short">Connect</span>
							</>
						)}
					</button>
					)}
				</div>
			</header>
			{children}
		</div>
	);
}

function StellarConnectedPill({
	address,
	onDisconnect,
}: {
	address: string;
	onDisconnect?: () => void;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function onPointerDown(event: MouseEvent) {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		}
		window.addEventListener("mousedown", onPointerDown);
		return () => window.removeEventListener("mousedown", onPointerDown);
	}, [open]);

	return (
		<div ref={rootRef}>
			<button
				type="button"
				className="wallet-menu-trigger"
				aria-expanded={open}
				aria-haspopup="menu"
				onClick={() => setOpen((value) => !value)}
			>
				<Wallet size={17} strokeWidth={1.7} />
				{shortStellarAddress(address)}
			</button>
			{open ? (
				<div className="wallet-menu-content" role="menu">
					<div className="wallet-menu-heading">
		<span>Stellar wallet</span>
						<strong>{shortStellarAddress(address)}</strong>
					</div>
					{onDisconnect ? (
						<button
							type="button"
							className="wallet-menu-action danger"
							role="menuitem"
							onClick={() => {
								setOpen(false);
								onDisconnect();
							}}
						>
							Log out
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
