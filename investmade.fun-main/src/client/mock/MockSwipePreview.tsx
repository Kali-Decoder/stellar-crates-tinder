import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Candidate, OnboardingPreferences } from "../../domain/schemas";
import { SwipeCard } from "../components/SwipeCard";
import { buildMockCandidates } from "./data";

const PREVIEW_PREFERENCES: OnboardingPreferences = {
	activeChain: "ROBINHOOD",
	executionProvider: "ZERO_EX",
	feedRankingProvider: "DETERMINISTIC",
	cadence: "weekly",
	periodLimitUsd: 100,
	ticketSizeUsd: 10,
	riskMode: "balanced",
	assetClasses: ["CRYPTO", "STOCK_TOKEN"],
	riskDisclosureAccepted: true,
};

type Feedback = "invest" | "skip";

/** Welcome-screen demo: asset charts with left/right swipe animation. */
export function MockSwipePreview() {
	const candidates = useMemo(
		() =>
			buildMockCandidates(PREVIEW_PREFERENCES, "10000000").slice(0, 6) as Candidate[],
		[],
	);
	const [index, setIndex] = useState(0);
	const [feedback, setFeedback] = useState<Feedback>();
	const [infoOpen, setInfoOpen] = useState(false);
	const [hintX, setHintX] = useState(0);

	const current = candidates[index % Math.max(candidates.length, 1)];

	useEffect(() => {
		if (!candidates.length || feedback) return;
		let cancelled = false;
		let phase = 0;
		const timer = window.setInterval(() => {
			if (cancelled) return;
			phase = (phase + 1) % 4;
			if (phase === 1) setHintX(42);
			else if (phase === 2) setHintX(-42);
			else setHintX(0);
		}, 900);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [candidates.length, feedback, index]);

	useEffect(() => {
		if (!feedback) return;
		const timer = window.setTimeout(() => {
			setFeedback(undefined);
			setInfoOpen(false);
			setHintX(0);
			setIndex((value) => (value + 1) % candidates.length);
		}, 420);
		return () => window.clearTimeout(timer);
	}, [candidates.length, feedback]);

	if (!current) return null;

	function decide(add: boolean) {
		if (feedback) return;
		setHintX(0);
		setFeedback(add ? "invest" : "skip");
	}

	return (
		<div className="onboarding-swipe-preview" aria-label="Sample Swyft asset cards">
			<div
				className="onboarding-swipe-stage"
				style={
					feedback
						? undefined
						: {
								transform: `translateX(${hintX}px) rotate(${hintX / 28}deg)`,
								transition: "transform 480ms ease",
							}
				}
			>
				<SwipeCard
					candidate={current}
					reason={current.reason}
					ticketSizeUsd={10}
					stableToken="USDC"
					feedback={feedback}
					infoOpen={infoOpen}
					onInfoOpenChange={setInfoOpen}
					onSwipe={decide}
				/>
			</div>
			<div className="onboarding-swipe-actions">
				<button
					type="button"
					className="button button-outline"
					onClick={() => decide(false)}
					disabled={Boolean(feedback)}
					aria-label="Skip sample card"
				>
					<ChevronLeft /> Skip
				</button>
				<button
					type="button"
					className="button button-primary"
					onClick={() => decide(true)}
					disabled={Boolean(feedback)}
					aria-label="Add sample card"
				>
					Add <ChevronRight />
				</button>
			</div>
			<small>Try the swipe — charts are live in your Stellar feed after you connect.</small>
		</div>
	);
}
