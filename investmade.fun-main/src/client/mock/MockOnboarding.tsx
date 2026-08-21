import { useEffect, useState, type ReactNode } from "react";
import { Wallet } from "lucide-react";
import {
	type AppChain,
	isPeriodLimitUsd,
	isTicketSizeUsd,
	type OnboardingPreferences,
} from "../../domain/schemas";
import type { PublicConfig } from "../api";
import { ArrowRight, Check, Shield } from "../components/Icons";
import { shortStellarAddress } from "../stellar/kit";

type Step =
	| "welcome"
	| "cadence"
	| "limit"
	| "ticket"
	| "risk"
	| "assets"
	| "review";

type Draft = {
	activeChain: AppChain;
	cadence?: OnboardingPreferences["cadence"];
	periodLimitUsd?: number;
	ticketSizeUsd?: number;
	riskMode?: OnboardingPreferences["riskMode"];
	assetChoice?: "CRYPTO" | "STOCK_TOKEN" | "BOTH";
	riskDisclosureAccepted: boolean;
};

export function MockOnboarding({
	config: _config,
	onComplete,
	onChainPreview,
	stellarAddress,
	stellarConnecting,
	stellarError,
	onConnectWallet,
}: {
	config: PublicConfig;
	onComplete: (preferences: OnboardingPreferences) => void | Promise<void>;
	onChainPreview: (chain: AppChain) => void;
	stellarAddress?: string;
	stellarConnecting?: boolean;
	stellarError?: string;
	onConnectWallet: () => void;
}) {
	const [step, setStep] = useState<Step>("welcome");
	const [draft, setDraft] = useState<Draft>({
		activeChain: "ROBINHOOD",
		riskDisclosureAccepted: false,
	});
	const preferences = toPreferences(draft, false);
	const completed = toPreferences(draft, true);

	useEffect(() => {
		onChainPreview(draft.activeChain);
	}, [draft.activeChain, onChainPreview]);

	useEffect(() => {
		if (step === "welcome") return;
		requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
	}, [step]);

	return (
		<main
			className={`onboarding-page${step === "welcome" ? "" : " onboarding-focused"}`}
		>
			<section className="onboarding-copy">
				<span className="eyebrow">Swyft · Built on Stellar</span>
				<h1>
					RWAs on Stellar. One <span className="headline-fun">fun</span>{" "}
					ritual.
				</h1>
				<p>
					Swyft turns a fixed budget into a swipe ritual for tokenized real-world
					assets and crypto on Stellar. Your preset limit keeps every session in
					bounds, and nothing moves until you approve it with your Stellar
					wallet.
				</p>
				<div className="onboarding-connect-control">
					<fieldset className="onboarding-chain-selector">
						<legend className="sr-only">Network</legend>
						<button type="button" className="active" aria-pressed="true">
							<img
								className="chain-mark chain-mark-stellar"
								src="/assets/chains/stellar.svg"
								width={20}
								height={20}
								alt=""
								aria-hidden="true"
							/>
							<span>Stellar</span>
						</button>
					</fieldset>
					<button
						type="button"
						className="button button-primary onboarding-connect-button"
						onClick={onConnectWallet}
						disabled={stellarConnecting}
						aria-label="Connect Stellar wallet"
						title="Connect Stellar wallet"
					>
						<Wallet size={18} strokeWidth={1.8} />
						{stellarConnecting
							? "Connecting…"
							: stellarAddress
								? shortStellarAddress(stellarAddress)
								: "Connect Stellar wallet"}
					</button>
				</div>
				{stellarError ? (
					<div className="error-message" role="alert">
						{stellarError}
					</div>
				) : null}
				<div className="onboarding-points">
					<p>
						<span>1</span>
						<b>Set your rules</b>
						<small>
							Choose your investment schedule, spending limit, and amount for
							each decision.
						</small>
					</p>
					<p>
						<span>2</span>
						<b>Your Stellar asset feed</b>
						<small>
							Your preferences shape a feed of eligible Stellar RWAs and crypto.
						</small>
					</p>
					<p>
						<span>3</span>
						<b>Review and approve</b>
						<small>
							You review the basket and confirm once with your Stellar wallet.
						</small>
					</p>
				</div>
			</section>

			<section className="onboarding-action">
				{step === "welcome" ? (
					<>
						<span className="onboarding-kicker">New here?</span>
						<h2>Build your Swyft plan</h2>
						<p>
							Answer five questions, then explore Basket, Portfolio, Activity,
							and Account on Stellar.
						</p>
						<button
							type="button"
							className="button button-primary"
							onClick={() => setStep("cadence")}
						>
							Answer 5 questions <ArrowRight />
						</button>
						<small>
							{stellarAddress
								? `Connected ${shortStellarAddress(stellarAddress)}`
								: "Connect a Stellar wallet anytime before you save."}
						</small>
					</>
				) : null}

				{step === "cadence" ? (
					<Question
						kicker="Your pace"
						title="Investment period"
						back={() => setStep("welcome")}
						next={() => setStep("limit")}
						nextDisabled={!draft.cadence}
					>
						{(
							[
								["daily", "Daily limit"],
								["weekly", "Weekly limit"],
								["monthly", "Monthly limit"],
							] as const
						).map(([id, title]) => (
							<Option
								key={id}
								selected={draft.cadence === id}
								title={title}
								onClick={() =>
									setDraft((current) => ({ ...current, cadence: id }))
								}
							/>
						))}
					</Question>
				) : null}

				{step === "limit" ? (
					<Question
						kicker="Your cap"
						title="Set this limit"
						back={() => setStep("cadence")}
						next={() => setStep("ticket")}
						nextDisabled={!draft.periodLimitUsd}
					>
						{[10, 50, 100].map((value) => (
							<Option
								key={value}
								selected={draft.periodLimitUsd === value}
								title={`$${value}`}
								onClick={() =>
									setDraft((current) => ({
										...current,
										periodLimitUsd: value,
										ticketSizeUsd:
											current.ticketSizeUsd && current.ticketSizeUsd > value
												? value
												: current.ticketSizeUsd,
									}))
								}
							/>
						))}
					</Question>
				) : null}

				{step === "ticket" ? (
					<Question
						kicker="Decision size"
						title="How much per add?"
						back={() => setStep("limit")}
						next={() => setStep("risk")}
						nextDisabled={
							!draft.ticketSizeUsd ||
							draft.ticketSizeUsd > (draft.periodLimitUsd ?? 100)
						}
					>
						{[0.1, 1, 10].map((value) => (
							<Option
								key={value}
								selected={draft.ticketSizeUsd === value}
								title={`$${value.toFixed(2)}`}
								onClick={() =>
									setDraft((current) => ({ ...current, ticketSizeUsd: value }))
								}
							/>
						))}
					</Question>
				) : null}

				{step === "risk" ? (
					<Question
						kicker="Risk preference"
						title="How should we rank opportunity?"
						back={() => setStep("ticket")}
						next={() => setStep("assets")}
						nextDisabled={!draft.riskMode}
					>
						{(
							[
								["conservative", "Conservative"],
								["balanced", "Balanced"],
								["degen", "Degen"],
							] as const
						).map(([id, title]) => (
							<Option
								key={id}
								selected={draft.riskMode === id}
								title={title}
								onClick={() =>
									setDraft((current) => ({ ...current, riskMode: id }))
								}
							/>
						))}
					</Question>
				) : null}

				{step === "assets" ? (
					<Question
						kicker="Asset mix"
						title="What can appear in your Stellar feed?"
						back={() => setStep("risk")}
						next={() => setStep("review")}
						nextDisabled={!draft.assetChoice}
					>
						{(
							[
								["BOTH", "RWAs + crypto"],
								["CRYPTO", "Crypto"],
								["STOCK_TOKEN", "Tokenized RWAs"],
							] as const
						).map(([id, title]) => (
							<Option
								key={id}
								selected={draft.assetChoice === id}
								title={title}
								onClick={() =>
									setDraft((current) => ({ ...current, assetChoice: id }))
								}
							/>
						))}
					</Question>
				) : null}

				{step === "review" && preferences ? (
					<>
						<Shield />
						<span className="onboarding-kicker">Review</span>
						<h2>Your Swyft investment plan</h2>
						<p>
							{preferences.cadence} · ${preferences.periodLimitUsd} cap · $
							{preferences.ticketSizeUsd} ticket · {preferences.riskMode} ·{" "}
							{preferences.assetClasses.join(" + ")} · Stellar
						</p>
						<label className="risk-acknowledgement">
							<input
								type="checkbox"
								checked={draft.riskDisclosureAccepted}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										riskDisclosureAccepted: event.target.checked,
									}))
								}
							/>
							<span>
								I understand ranking is not financial advice; Stellar assets can
								lose value; and every trade requires my Stellar wallet approval.
							</span>
						</label>
						<div className="question-actions">
							<button
								type="button"
								className="button button-outline"
								onClick={() => setStep("assets")}
							>
								Back
							</button>
							<button
								type="button"
								className="button button-primary"
								disabled={!completed || !stellarAddress}
								onClick={() => {
									if (completed) void onComplete(completed);
								}}
							>
								Save plan & continue <ArrowRight />
							</button>
						</div>
						<small>
							{stellarAddress
								? "Non-custodial on Stellar. No trading mandate. No autonomous execution."
								: "Connect a Stellar wallet above to save your plan."}
						</small>
					</>
				) : null}
			</section>
		</main>
	);
}

function Question({
	kicker,
	title,
	children,
	back,
	next,
	nextDisabled,
}: {
	kicker: string;
	title: string;
	children: ReactNode;
	back: () => void;
	next: () => void;
	nextDisabled: boolean;
}) {
	return (
		<>
			<span className="onboarding-kicker">{kicker}</span>
			<h2>{title}</h2>
			<div className="question-options">{children}</div>
			<div className="question-actions">
				<button type="button" className="button button-outline" onClick={back}>
					Back
				</button>
				<button
					type="button"
					className="button button-primary"
					onClick={next}
					disabled={nextDisabled}
				>
					Continue <ArrowRight />
				</button>
			</div>
		</>
	);
}

function Option({
	selected,
	title,
	onClick,
}: {
	selected: boolean;
	title: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={selected ? "question-option selected" : "question-option"}
			onClick={onClick}
		>
			<span>
				<b>{title}</b>
			</span>
			{selected ? <Check /> : null}
		</button>
	);
}

function toPreferences(
	draft: Draft,
	requireDisclosure: boolean,
): OnboardingPreferences | undefined {
	if (
		!draft.cadence ||
		!draft.periodLimitUsd ||
		!isPeriodLimitUsd(draft.periodLimitUsd) ||
		!draft.ticketSizeUsd ||
		!isTicketSizeUsd(draft.ticketSizeUsd) ||
		!draft.riskMode ||
		!draft.assetChoice ||
		(requireDisclosure && !draft.riskDisclosureAccepted)
	) {
		return undefined;
	}
	return {
		activeChain: draft.activeChain,
		executionProvider: "ZERO_EX",
		feedRankingProvider: "DETERMINISTIC",
		cadence: draft.cadence,
		periodLimitUsd: draft.periodLimitUsd,
		ticketSizeUsd: draft.ticketSizeUsd,
		riskMode: draft.riskMode,
		assetClasses:
			draft.assetChoice === "BOTH"
				? ["CRYPTO", "STOCK_TOKEN"]
				: [draft.assetChoice],
		riskDisclosureAccepted: true,
	};
}
