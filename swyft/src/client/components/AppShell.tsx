import {
	type ReactNode,
	lazy,
	Suspense,
	useEffect,
	useRef,
	useState,
} from "react";
import { Wallet } from "lucide-react";
import { shortStellarAddress } from "../stellar/kit";
import { ThemeToggle } from "./ThemeToggle";

/** Minimal wallet shape so AppShell stays free of Privy/Solana imports. */
export type ShellFundingWallet = {
	address: string;
};

export type ShellSolanaWallet = {
	address: string;
	standardWallet?: { name?: string };
};

const WalletMenu = lazy(() =>
	import("./WalletMenu").then((mod) => ({ default: mod.WalletMenu })),
);

interface Props {
	active: "week" | "positions" | "receipts" | "account" | "docs";
	onNavigate: (target: Props["active"]) => void;
	wallet?: string;
	fundingWallet?: ShellFundingWallet;
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
	solanaWallets: ShellSolanaWallet[];
	solanaWalletsReady: boolean;
	solanaAvailable: boolean;
	selectedSolanaWallet?: ShellSolanaWallet;
	onSolanaWalletChange: (wallet: ShellSolanaWallet) => void;
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
			if (themeColor && previousThemeColor)
				themeColor.content = previousThemeColor;
		};
	}, [activeChain, mockMode]);

	return (
		<div className="app-shell">
			<header
				className={navigationEnabled ? "topbar" : "topbar topbar-onboarding"}
			>
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
							["docs", "Docs"],
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
								<Suspense fallback={null}>
									<WalletMenu
										wallet={wallet}
										fundingWallet={fundingWallet as never}
										topUpRequest={topUpRequest}
										activeChain={activeChain}
										onChainChange={onChainChange}
										solanaWallets={solanaWallets as never}
										solanaWalletsReady={solanaWalletsReady}
										solanaAvailable={solanaAvailable}
										selectedSolanaWallet={selectedSolanaWallet as never}
										onSolanaWalletChange={onSolanaWalletChange as never}
									/>
								</Suspense>
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
									<span className="wallet-label-full">
										Connect Stellar wallet
									</span>
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
