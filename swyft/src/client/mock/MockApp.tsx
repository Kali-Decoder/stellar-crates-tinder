import { ShoppingBasket } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	BrowserRouter,
	Navigate,
	Route,
	Routes,
	useLocation,
	useNavigate,
} from "react-router-dom";
import {
	fillFeedPage,
	nextFeedExcludedAssetIds,
} from "../../domain/feed-pagination";
import {
	type AppChain,
	type Candidate,
	formatTicketSizeUsd,
	type OnboardingPreferences,
} from "../../domain/schemas";
import {
	api,
	type ExecutionRecord,
	type FeedResponse,
	type PublicConfig,
	type WeeklySession,
	installApiOverride,
} from "../api";
import { AppShell } from "../components/AppShell";
import { AssetCountLoader } from "../components/AssetCountLoader";
import { AssetIconProvider } from "../components/AssetMark";
import { AssetPickGrid } from "../components/AssetPickGrid";
import { BudgetRail } from "../components/BudgetRail";
import { LicenseGate } from "../components/LicenseModal";
import { ActivityScreen } from "../components/ActivityScreen";
import { DocsScreen } from "../components/DocsScreen";
import {
	type AppPage,
	APP_PATHS,
	pageForShellView,
	pageFromPath,
	pathForPage,
	type ShellView,
	shellViewForPage,
} from "../pages";
import { STELLAR_SUPPORTED_ASSET_COUNT } from "../stellar/config";
import { playSwipeSound, unlockSwipeAudio } from "../swipe-sounds";
import { ensureUserForWallet, type SwyftUser } from "../user-storage";
import { createMockApi } from "./api";
import { MOCK_CONFIG } from "./data";
import { MockAccount } from "./MockAccount";
import { MockLanding } from "./MockLanding";
import { MockOnboarding } from "./MockOnboarding";
import { MockPositions } from "./MockPositions";
import { MockReview } from "./MockReview";
import { buildDemoSettlement } from "./mock-portfolio-fixtures";
import { useStellarWallet } from "../stellar/useStellarWallet";

const DEMO_ACTIVITY = buildDemoSettlement();

const TWITTER_HANDLE = "swyftdotfun";
const TWITTER_URL = `https://x.com/${TWITTER_HANDLE}`;

installApiOverride(createMockApi() as typeof api);

const AUTHED_PAGES = new Set<AppPage>([
	"onboarding",
	"basket",
	"review",
	"portfolio",
	"activity",
	"account",
]);

export function MockApp() {
	return (
		<BrowserRouter>
			<LicenseGate>
				<Routes>
					<Route path="*" element={<MockAppRoutes />} />
				</Routes>
			</LicenseGate>
		</BrowserRouter>
	);
}

function MockAppRoutes() {
	const stellar = useStellarWallet();
	const navigate = useNavigate();
	const location = useLocation();
	const page = pageFromPath(location.pathname);
	const view = shellViewForPage(page);

	const [config] = useState<PublicConfig>(MOCK_CONFIG);
	const [docsReturnPage, setDocsReturnPage] = useState<AppPage>("landing");
	const [onboardingChain, setOnboardingChain] =
		useState<AppChain>("ROBINHOOD");
	const [session, setSession] = useState<WeeklySession>();
	const [feed, setFeed] = useState<FeedResponse>();
	const [preferences, setPreferences] = useState<OnboardingPreferences>();
	const [index, setIndex] = useState(0);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [settlement, setSettlement] = useState<ExecutionRecord>(
		() => DEMO_ACTIVITY.record,
	);
	const [error, setError] = useState("");
	const [loadingMore, setLoadingMore] = useState(false);
	const [feedExhausted, setFeedExhausted] = useState(false);
	const [basketSheetOpen, setBasketSheetOpen] = useState(false);
	const [isCompact, setIsCompact] = useState(false);
	const [user, setUser] = useState<SwyftUser>();
	const [sessionBusy, setSessionBusy] = useState(false);
	const warningsByAssetId = useRef(new Map<string, string[]>());

	const activeChain = preferences?.activeChain ?? onboardingChain;
	const wallet = stellar.address;
	const candidates = feed?.candidates ?? [];
	const selected = selectedIds
		.map((assetId) =>
			candidates.find((candidate) => candidate.assetId === assetId),
		)
		.filter((candidate): candidate is Candidate => Boolean(candidate));
	const ticketSizeUsd = preferences?.ticketSizeUsd ?? 10;
	const periodLimitUsd = preferences?.periodLimitUsd ?? 100;
	const selectedTotalUsd = selected.length * ticketSizeUsd;
	const stableToken = "USDC";
	const canAddMore = selectedTotalUsd + ticketSizeUsd <= periodLimitUsd;

	const goTo = useCallback(
		(next: AppPage, options?: { replace?: boolean }) => {
			window.scrollTo({ top: 0, behavior: "auto" });
			navigate(pathForPage(next), { replace: options?.replace });
		},
		[navigate],
	);

	const loadSession = useCallback(
		async (next: OnboardingPreferences) => {
			setError("");
			setSessionBusy(true);
			setPreferences(next);
			setSession(undefined);
			setFeed(undefined);
			setIndex(0);
			setSelectedIds([]);
			setFeedExhausted(false);
			goTo("basket");
			const minimumLoader = new Promise((resolve) =>
				window.setTimeout(resolve, 700),
			);
			try {
				await api.savePreferences(next);
				const opened = await api.openSession(
					next.cadence,
					next.executionProvider,
					next.activeChain,
					next.feedRankingProvider,
				);
				const generated = await api.generateFeed(opened.id, next);
				await minimumLoader;
				for (const candidate of generated.candidates) {
					warningsByAssetId.current.set(
						candidate.assetId,
						generated.feed.warnings,
					);
				}
				setSession(opened);
				setFeed({
					...generated,
					candidates: generated.candidates,
				});
				window.scrollTo({ top: 0, behavior: "auto" });
			} catch (caught) {
				await minimumLoader;
				setError(
					caught instanceof Error
						? caught.message
						: "Could not open mock session",
				);
			} finally {
				setSessionBusy(false);
			}
		},
		[goTo],
	);

	useEffect(() => {
		const media = window.matchMedia("(max-width: 760px)");
		const sync = () => {
			setIsCompact(media.matches);
			if (!media.matches) setBasketSheetOpen(false);
		};
		sync();
		media.addEventListener("change", sync);
		return () => media.removeEventListener("change", sync);
	}, []);

	useEffect(() => {
		if (!basketSheetOpen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setBasketSheetOpen(false);
		};
		window.addEventListener("keydown", onKey);
		document.documentElement.classList.add("basket-sheet-lock");
		return () => {
			window.removeEventListener("keydown", onKey);
			document.documentElement.classList.remove("basket-sheet-lock");
		};
	}, [basketSheetOpen]);

	useEffect(() => {
		if (!wallet) {
			setUser(undefined);
			return;
		}
		setUser(ensureUserForWallet(wallet));
	}, [wallet]);

	useEffect(() => {
		if (!AUTHED_PAGES.has(page)) return;
		if (wallet) return;
		goTo("landing", { replace: true });
	}, [goTo, page, wallet]);

	const loadMoreCandidates = useCallback(async () => {
		if (!feed || !preferences || !session || loadingMore || feedExhausted)
			return;
		setLoadingMore(true);
		try {
			const next = await api.generateFeed(
				session.id,
				preferences,
				nextFeedExcludedAssetIds(feed),
			);
			const nextCandidates = fillFeedPage(next.candidates);
			if (!nextCandidates.length) {
				setFeedExhausted(true);
				return;
			}
			setFeed((currentFeed) => {
				if (!currentFeed) return next;
				const rankOffset = currentFeed.feed.cards.length;
				return {
					...next,
					candidates: [...currentFeed.candidates, ...nextCandidates],
					feed: {
						...next.feed,
						cards: [
							...currentFeed.feed.cards,
							...next.feed.cards.map((card, cardIndex) => ({
								...card,
								rank: rankOffset + cardIndex + 1,
							})),
						],
					},
				};
			});
		} catch {
			setFeedExhausted(true);
		} finally {
			setLoadingMore(false);
		}
	}, [feed, feedExhausted, loadingMore, preferences, session]);

	useEffect(() => {
		if (!feed?.hasMore || feedExhausted || loadingMore) return;
		if (candidates.length >= 48) return;
		void loadMoreCandidates();
	}, [
		candidates.length,
		feed,
		feedExhausted,
		loadMoreCandidates,
		loadingMore,
	]);

	function goReview() {
		setBasketSheetOpen(false);
		goTo("review");
	}

	function toggleAsset(assetId: string, nextSelected: boolean) {
		unlockSwipeAudio();
		if (nextSelected) {
			if (!canAddMore || selectedIds.includes(assetId)) return;
			playSwipeSound("add");
			setSelectedIds((ids) => [...ids, assetId]);
			return;
		}
		playSwipeSound("skip");
		setSelectedIds((ids) => ids.filter((id) => id !== assetId));
		setFeedExhausted(false);
	}

	function remove(assetId: string) {
		setSelectedIds((ids) => ids.filter((id) => id !== assetId));
		setFeedExhausted(false);
	}

	function navigateShell(target: ShellView) {
		if (page === "onboarding") return;
		goTo(pageForShellView(target));
	}

	function openDocs(from: AppPage = page) {
		setDocsReturnPage(from === "docs" ? "landing" : from);
		goTo("docs");
	}

	function closeDocs() {
		goTo(docsReturnPage === "docs" ? "landing" : docsReturnPage);
	}

	async function handleConnectWallet() {
		try {
			const address = await stellar.connect();
			setUser(ensureUserForWallet(address));
		} catch {
			// User closed modal or wallet rejected — keep existing connect CTA.
		}
	}

	async function enterFromLanding() {
		if (stellar.address) {
			setUser(ensureUserForWallet(stellar.address));
			goTo("onboarding");
			return;
		}
		try {
			const address = await stellar.connect();
			setUser(ensureUserForWallet(address));
			goTo("onboarding");
		} catch {
			// Stay on landing if the modal is dismissed.
		}
	}

	if (page === "docs" && (!wallet || docsReturnPage === "landing")) {
		return (
			<div className="docs-standalone">
				<DocsScreen onBack={closeDocs} />
			</div>
		);
	}

	if (page === "landing") {
		return (
			<MockLanding
				onSignIn={() => void enterFromLanding()}
				onOpenDocs={() => openDocs("landing")}
				signingIn={stellar.isConnecting}
				signedIn={Boolean(stellar.address)}
			/>
		);
	}

	if (AUTHED_PAGES.has(page) && !wallet) {
		return <Navigate to={APP_PATHS.landing} replace />;
	}

	return (
		<AssetIconProvider>
			<AppShell
				active={view}
				onNavigate={navigateShell}
				wallet={wallet}
				username={user?.username}
				mockMode
				walletReady
				walletConnecting={stellar.isConnecting}
				onWallet={() => void handleConnectWallet()}
				onDisconnect={() => {
					void stellar.disconnect();
					setUser(undefined);
					setPreferences(undefined);
					setFeed(undefined);
					setSession(undefined);
					goTo("landing");
				}}
				navigationEnabled={page !== "onboarding"}
				activeChain={activeChain}
				onChainChange={() => undefined}
				solanaWallets={[]}
				solanaWalletsReady
				solanaAvailable={config.solana.available}
				onSolanaWalletChange={() => undefined}
			>
				{page === "onboarding" ? (
					<MockOnboarding
						config={config}
						onComplete={loadSession}
						onChainPreview={setOnboardingChain}
						stellarAddress={wallet}
						stellarConnecting={stellar.isConnecting}
						stellarError={stellar.error}
						onConnectWallet={() => void handleConnectWallet()}
					/>
				) : page === "activity" ? (
					<ActivityScreen
						wallet={wallet ?? ""}
						latestSettlement={settlement}
						onViewPortfolio={() => goTo("portfolio")}
						onStartNextBasket={() => {
							if (preferences) {
								void loadSession(preferences);
							}
						}}
					/>
				) : page === "portfolio" ? (
					<MockPositions
						candidates={Array.from(
							new Map(
								candidates.map((candidate) => [candidate.assetId, candidate]),
							).values(),
						)}
						wallet={wallet ?? ""}
					/>
				) : page === "docs" ? (
					<DocsScreen onBack={() => goTo("basket")} />
				) : page === "account" && preferences ? (
					<MockAccount
						wallet={wallet ?? ""}
						user={user}
						username={user?.username}
						preferences={preferences}
						onResetPlan={() => {
							void loadSession(preferences);
						}}
						onOpenPortfolio={() => goTo("portfolio")}
						onDisconnect={() => {
							void stellar.disconnect();
							setUser(undefined);
							setPreferences(undefined);
							setFeed(undefined);
							setSession(undefined);
							goTo("landing");
						}}
					/>
				) : page === "account" ? (
					<Navigate to={APP_PATHS.onboarding} replace />
				) : page === "review" && session && feed ? (
					<MockReview
						session={session}
						feed={feed}
						selected={selected}
						onRemove={remove}
						onBack={() => goTo("basket")}
						onSettled={(record) => {
							setSettlement(record);
							goTo("activity");
						}}
						onExecutionChange={setSettlement}
						ticketSizeUsd={ticketSizeUsd}
						periodLimitUsd={periodLimitUsd}
						wallet={wallet ?? ""}
						activeChain={activeChain}
					/>
				) : page === "review" ? (
					<Navigate to={APP_PATHS.basket} replace />
				) : (
					<main className="swipe-page asset-pick-page">
						<section className="swipe-workspace asset-pick-workspace">
							{error ? (
								<div className="fatal-state page-loader">
									<h2>Session unavailable</h2>
									<p>{error}</p>
									<button
										type="button"
										onClick={() => {
											if (preferences) void loadSession(preferences);
										}}
									>
										Try again
									</button>
								</div>
							) : sessionBusy || !feed ? (
								<AssetCountLoader
									title="Building your Swyft feed"
									subtitle="Eligible RWAs on Stellar. You stay in control."
								/>
							) : (
								<>
									<header className="page-heading">
										<h1>Build your basket</h1>
										<p>
											Tap cards to select or deselect. Scroll to browse — no
											charts, no swipe.
										</p>
									</header>
									<div className="asset-pick-toolbar mt-3">
										<span>
											{selected.length} selected ·{" "}
											{formatTicketSizeUsd(selectedTotalUsd)} {stableToken}
										</span>
										<button
											type="button"
											className="button button-primary"
											disabled={!selected.length}
											onClick={goReview}
										>
											Review basket ({selected.length}) <ShoppingBasket />
										</button>
									</div>
									<AssetPickGrid
										candidates={candidates}
										selectedIds={selectedIds}
										ticketSizeUsd={ticketSizeUsd}
										canAddMore={canAddMore}
										onToggle={toggleAsset}
									/>
									{loadingMore ? (
										<p className="asset-pick-loading">Loading more assets…</p>
									) : null}
									<footer className="swipe-session-footer">
										<span>
											{candidates.length} shown · {STELLAR_SUPPORTED_ASSET_COUNT}{" "}
											on Stellar vault
										</span>
										<a
											href={TWITTER_URL}
											target="_blank"
											rel="noopener noreferrer"
										>
											@{TWITTER_HANDLE}
										</a>
									</footer>
								</>
							)}
						</section>
						<BudgetRail
							selected={selected}
							onRemove={remove}
							ticketSizeUsd={ticketSizeUsd}
							periodLimitUsd={periodLimitUsd}
							executionProvider={
								preferences?.executionProvider ??
								session?.executionProvider ??
								"ZERO_EX"
							}
							activeChain={activeChain}
							stableToken="USDC"
							networkLabel="Stellar"
							quoteLabel="Stellar"
							sheetOpen={basketSheetOpen}
							onSheetOpenChange={isCompact ? setBasketSheetOpen : undefined}
							onReview={selected.length ? goReview : undefined}
						/>
					</main>
				)}
			</AppShell>
		</AssetIconProvider>
	);
}
