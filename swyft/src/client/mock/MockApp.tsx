import {
	Bot,
	ShoppingBasket,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	fillFeedPage,
	nextFeedExcludedAssetIds,
	shouldPrefetchNextFeed,
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
import { AssetIconProvider } from "../components/AssetMark";
import { BudgetRail } from "../components/BudgetRail";
import { Confetti } from "../components/magicui/confetti";
import { ReceiptScreen } from "../components/ReceiptScreen";
import { SwipeCard } from "../components/SwipeCard";
import { createMockApi } from "./api";
import { MOCK_CONFIG } from "./data";
import { MockAccount } from "./MockAccount";
import { MockLanding } from "./MockLanding";
import { MockOnboarding } from "./MockOnboarding";
import { MockPositions } from "./MockPositions";
import { MockReview } from "./MockReview";
import { useStellarWallet } from "../stellar/useStellarWallet";

installApiOverride(createMockApi() as typeof api);

type View = "week" | "positions" | "receipts" | "account";
type Stage = "landing" | "loading" | "onboarding" | "swipe" | "review";
type DecisionFeedback = "invest" | "skip";

export function MockApp() {
	const stellar = useStellarWallet();
	const [config] = useState<PublicConfig>(MOCK_CONFIG);
	const [view, setView] = useState<View>("week");
	const [stage, setStage] = useState<Stage>("landing");
	const [onboardingChain, setOnboardingChain] =
		useState<AppChain>("ROBINHOOD");
	const [session, setSession] = useState<WeeklySession>();
	const [feed, setFeed] = useState<FeedResponse>();
	const [preferences, setPreferences] = useState<OnboardingPreferences>();
	const [index, setIndex] = useState(0);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [assetInfoOpen, setAssetInfoOpen] = useState(false);
	const [settlement, setSettlement] = useState<ExecutionRecord>();
	const [receiptCandidates, setReceiptCandidates] = useState<Candidate[]>([]);
	const [error, setError] = useState("");
	const [decisionFeedback, setDecisionFeedback] = useState<DecisionFeedback>();
	const [loadingMore, setLoadingMore] = useState(false);
	const [feedExhausted, setFeedExhausted] = useState(false);
	const [basketSheetOpen, setBasketSheetOpen] = useState(false);
	const [isCompact, setIsCompact] = useState(false);
	const decisionTimer = useRef<number | undefined>(undefined);
	const warningsByAssetId = useRef(new Map<string, string[]>());

	const activeChain = preferences?.activeChain ?? onboardingChain;
	const wallet = stellar.address;
	const candidates = feed?.candidates ?? [];
	const current = candidates[index];
	const currentFeedCard = current
		? feed?.feed.cards.find((card) => card.assetId === current.assetId)
		: undefined;
	const currentWarnings = current
		? (warningsByAssetId.current.get(current.assetId) ??
			feed?.feed.warnings ??
			[])
		: [];
	const selected = selectedIds
		.map((assetId) =>
			candidates.find((candidate) => candidate.assetId === assetId),
		)
		.filter((candidate): candidate is Candidate => Boolean(candidate));
	const ticketSizeUsd = preferences?.ticketSizeUsd ?? 10;
	const periodLimitUsd = preferences?.periodLimitUsd ?? 100;
	const selectedTotalUsd = selected.length * ticketSizeUsd;
	const stableToken = "USDC";
	const canAddCurrent = selectedTotalUsd + ticketSizeUsd <= periodLimitUsd;

	const loadSession = useCallback(async (next: OnboardingPreferences) => {
		setError("");
		setView("week");
		setStage("loading");
		setPreferences(next);
		setSession(undefined);
		setFeed(undefined);
		setIndex(0);
		setSelectedIds([]);
		setFeedExhausted(false);
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
				candidates: fillFeedPage(generated.candidates),
			});
			setStage("swipe");
			window.scrollTo({ top: 0, behavior: "auto" });
		} catch (caught) {
			await minimumLoader;
			setError(
				caught instanceof Error ? caught.message : "Could not open mock session",
			);
			setStage("swipe");
		}
	}, []);

	useEffect(
		() => () => {
			if (decisionTimer.current) window.clearTimeout(decisionTimer.current);
		},
		[],
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
		if (
			!feed?.hasMore ||
			feedExhausted ||
			loadingMore ||
			!shouldPrefetchNextFeed(index, candidates.length)
		) {
			return;
		}
		void loadMoreCandidates();
	}, [
		candidates.length,
		feed,
		feedExhausted,
		index,
		loadMoreCandidates,
		loadingMore,
	]);

	function decide(add: boolean) {
		if (!current) return;
		if (add && !selectedIds.includes(current.assetId) && canAddCurrent) {
			setSelectedIds((ids) => [...ids, current.assetId]);
			if (isCompact) {
				// Brief pulse on the FAB without forcing the sheet open mid-swipe.
				setBasketSheetOpen(false);
			}
		}
		setIndex((value) => Math.min(value + 1, candidates.length));
	}

	function goReview() {
		window.scrollTo({ top: 0, behavior: "auto" });
		setBasketSheetOpen(false);
		setStage("review");
	}

	function animateDecision(add: boolean) {
		if (!current || decisionFeedback || (add && !canAddCurrent)) return;
		setDecisionFeedback(add ? "invest" : "skip");
		decisionTimer.current = window.setTimeout(() => {
			decide(add);
			setDecisionFeedback(undefined);
			decisionTimer.current = undefined;
		}, 300);
	}

	function remove(assetId: string) {
		setSelectedIds((ids) => ids.filter((id) => id !== assetId));
		setFeedExhausted(false);
	}

	function navigate(target: View) {
		if (stage === "onboarding") return;
		window.scrollTo({ top: 0, behavior: "auto" });
		setView(target);
		if (target === "week" && stage === "loading" && feed) setStage("swipe");
	}

	async function handleConnectWallet() {
		try {
			await stellar.connect();
		} catch {
			// User closed modal or wallet rejected — keep existing connect CTA.
		}
	}

	async function enterFromLanding() {
		if (stellar.address) {
			setStage("onboarding");
			return;
		}
		try {
			await stellar.connect();
			setStage("onboarding");
		} catch {
			// Stay on landing if the modal is dismissed.
		}
	}

	if (stage === "landing") {
		return (
			<MockLanding
				onSignIn={() => void enterFromLanding()}
				signingIn={stellar.isConnecting}
				signedIn={Boolean(stellar.address)}
			/>
		);
	}

	return (
		<AssetIconProvider>
			<AppShell
				active={view}
				onNavigate={navigate}
				wallet={wallet}
				mockMode
				walletReady
				walletConnecting={stellar.isConnecting}
				onWallet={() => void handleConnectWallet()}
				onDisconnect={() => void stellar.disconnect()}
				navigationEnabled={stage !== "onboarding"}
				activeChain={activeChain}
				onChainChange={() => undefined}
				solanaWallets={[]}
				solanaWalletsReady
				solanaAvailable={config.solana.available}
				onSolanaWalletChange={() => undefined}
			>
				{stage === "onboarding" ? (
					<MockOnboarding
						config={config}
						onComplete={loadSession}
						onChainPreview={setOnboardingChain}
						stellarAddress={wallet}
						stellarConnecting={stellar.isConnecting}
						stellarError={stellar.error}
						onConnectWallet={() => void handleConnectWallet()}
					/>
				) : view === "receipts" ? (
					<ReceiptScreen
						record={settlement}
						selected={receiptCandidates.length ? receiptCandidates : selected}
						feed={feed}
						demoMode={!settlement?.transactionHashes.some((h) => h.length > 40)}
						onResume={async () => {
							if (!settlement) return;
							setSettlement(await api.reconcile(settlement.plan.executionId));
						}}
						onViewPortfolio={() => {
							window.scrollTo({ top: 0, behavior: "auto" });
							setView("positions");
						}}
						onStartNextBasket={() => {
							if (preferences) {
								void loadSession(preferences);
								setView("week");
							}
						}}
					/>
				) : view === "positions" ? (
					<MockPositions
						candidates={Array.from(
							new Map(
								candidates.map((candidate) => [candidate.assetId, candidate]),
							).values(),
						)}
						wallet={wallet ?? ""}
					/>
				) : view === "account" && preferences ? (
					<MockAccount
						wallet={wallet ?? ""}
						preferences={preferences}
						onResetPlan={() => {
							void loadSession(preferences);
							setView("week");
						}}
						onDisconnect={() => {
							void stellar.disconnect();
							setStage("landing");
							setPreferences(undefined);
							setFeed(undefined);
							setSession(undefined);
						}}
					/>
				) : stage === "review" && session && feed ? (
					<MockReview
						session={session}
						feed={feed}
						selected={selected}
						onRemove={remove}
						onBack={() => {
							window.scrollTo({ top: 0, behavior: "auto" });
							setStage("swipe");
						}}
						onSettled={(record) => {
							setSettlement(record);
							setReceiptCandidates(selected);
							setView("receipts");
						}}
						onExecutionChange={(record) => {
							setSettlement(record);
							setReceiptCandidates(selected);
						}}
						ticketSizeUsd={ticketSizeUsd}
						periodLimitUsd={periodLimitUsd}
						wallet={wallet ?? ""}
						activeChain={activeChain}
					/>
				) : (
					<main className="swipe-page">
						<section className="swipe-workspace">
							<header className="page-heading">
								<h1>Build your basket</h1>
								<p>Drag right to add · left to skip.</p>
							</header>
							{error ? (
								<div className="fatal-state">
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
							) : stage === "loading" || !feed ? (
								<div className="loading-state">
									<div className="feed-loader" role="img" aria-label="Mock">
										<b>UI</b>
									</div>
									<h2>Building your Swyft feed</h2>
									<p>Eligible RWAs and crypto on Stellar. You stay in control.</p>
								</div>
							) : current ? (
								<>
									<div className="card-stage">
										<SwipeCard
											candidate={current}
											reason={currentFeedCard?.reason ?? current.reason}
											ticketSizeUsd={ticketSizeUsd}
											stableToken={stableToken}
											feedback={decisionFeedback}
											infoOpen={assetInfoOpen}
											onInfoOpenChange={setAssetInfoOpen}
											onSwipe={animateDecision}
										/>
										<div className="gesture-bar" role="group" aria-label="Swipe actions">
											<button
												type="button"
												className="gesture gesture-skip"
												onClick={() => animateDecision(false)}
												aria-label="Skip asset"
												disabled={Boolean(decisionFeedback)}
											>
												<span className="gesture-dir" aria-hidden="true">
													Left
												</span>
												<span className="gesture-label">Skip</span>
											</button>
											<button
												type="button"
												className="gesture gesture-add"
												onClick={() => animateDecision(true)}
												aria-label={`Add ${ticketSizeUsd} ${stableToken}`}
												disabled={Boolean(decisionFeedback) || !canAddCurrent}
											>
												<span className="gesture-dir" aria-hidden="true">
													Right
												</span>
												<span className="gesture-label">Add</span>
											</button>
										</div>
									</div>
									{currentWarnings.length ? (
										<aside className="ai-warnings" aria-label="Mock warnings">
											<Bot aria-hidden="true" />
											<ul>
												{currentWarnings.map((warning) => (
													<li key={warning}>{warning}</li>
												))}
											</ul>
										</aside>
									) : null}
								</>
							) : loadingMore ? (
								<div className="loading-state loading-more">
									<div className="feed-loader" role="img" aria-label="Mock">
										<b>UI</b>
									</div>
									<h2>Finding more assets…</h2>
								</div>
							) : (
								<div className="feed-complete">
									{selected.length ? (
										<Confetti
											className="completion-confetti"
											options={{
												gravity: 0.9,
												particleCount: 120,
												spread: 90,
												startVelocity: 36,
											}}
										/>
									) : null}
									<h2>That’s the feed.</h2>
									<p>
										{selected.length
											? `${formatTicketSizeUsd(selected.length * ticketSizeUsd)} ${stableToken} is ready for review.`
											: `You skipped every card. Your ${stableToken} stays put.`}
									</p>
									<button
										type="button"
										className="button button-primary"
										disabled={!selected.length}
										onClick={goReview}
									>
										Review basket ({selected.length}) <ShoppingBasket />
									</button>
								</div>
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
