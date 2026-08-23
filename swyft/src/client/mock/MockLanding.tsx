import {
	ChevronDown,
	ChevronRight,
	CreditCard,
	Info,
	Minus,
	Plus,
	Wallet,
} from "lucide-react";
import {
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type RefObject,
} from "react";
import {
	LANDING_AI_PORTFOLIO,
	LANDING_ASSET_CLASSES,
	LANDING_BASKETS,
	LANDING_CURRENCIES,
	LANDING_FAQS,
	LANDING_PERF_ENDINGS,
	LANDING_PERF_SERIES,
} from "./landing-data";
import { LandingBasketCard, LandingBasketDeck, TickerLogo } from "./LandingBasketDeck";
import { StableTokenLabel } from "../components/StableTokenLabel";
import { STELLAR_SUPPORTED_ASSET_COUNT } from "../stellar/config";
import "./landing.css";

export function MockLanding({
	onSignIn,
	onOpenDocs,
	signingIn,
	signedIn,
}: {
	onSignIn: () => void;
	onOpenDocs?: () => void;
	signingIn?: boolean;
	signedIn?: boolean;
}) {
	const ctaLabel = signingIn
		? "Connecting…"
		: signedIn
			? "Continue"
			: "Sign in";

	return (
		<div className="landing-page">
			<header className="landing-topbar landing-reveal is-in">
				<div className="landing-brand">
					<span className="landing-logo">
						swyft<span>.fun</span>
					</span>
					<span className="landing-beta">BETA</span>
				</div>
				<div className="landing-top-actions">
					{onOpenDocs ? (
						<button
							type="button"
							className="landing-docs-link"
							onClick={onOpenDocs}
						>
							Docs
						</button>
					) : null}
					<button
						type="button"
						className="landing-signin"
						onClick={onSignIn}
						disabled={signingIn}
					>
						{ctaLabel}
					</button>
				</div>
			</header>

			<main>
				<HeroSection
					onSignIn={onSignIn}
					signingIn={signingIn}
					ctaLabel={ctaLabel}
				/>
				<PerformanceSection />
				<AssetsSection onExplore={onSignIn} />
				<AiPortfolioSection onSignIn={onSignIn} />
				<MoneyFlowSection />
				<CtaBanner
					onSignIn={onSignIn}
					signingIn={signingIn}
					signedIn={signedIn}
				/>
				<FaqSection />
			</main>

			<footer className="landing-footer">
				<div className="landing-footer-main">
					<button
						type="button"
						className="landing-footer-brand"
						onClick={() =>
							window.scrollTo({ top: 0, behavior: "smooth" })
						}
						aria-label="Back to top"
					>
						<span className="landing-logo landing-footer-logo">
							swyft<span>.fun</span>
						</span>
						<small>Built on Stellar</small>
					</button>

					<nav className="landing-footer-nav" aria-label="Footer">
						{onOpenDocs ? (
							<button
								type="button"
								className="landing-footer-link"
								onClick={onOpenDocs}
							>
								Docs
							</button>
						) : null}
						{(
							[
								["#landing-faqs", "FAQ"],
								["#landing-assets", "Eligibility"],
								["#landing-perf", "Performance"],
								["#landing-cta", "Risk"],
							] as const
						).map(([href, label]) => (
							<a
								key={href}
								className="landing-footer-link"
								href={href}
								onClick={(event) => {
									event.preventDefault();
									document
										.querySelector(href)
										?.scrollIntoView({ behavior: "smooth", block: "start" });
								}}
							>
								{label}
							</a>
						))}
					</nav>

					<div className="landing-footer-actions">
						<button
							type="button"
							className="landing-footer-cta"
							onClick={onSignIn}
							disabled={signingIn}
						>
							{ctaLabel}
						</button>
						<button
							type="button"
							className="landing-footer-top"
							onClick={() =>
								window.scrollTo({ top: 0, behavior: "smooth" })
							}
							aria-label="Scroll to top"
						>
							↑ Top
						</button>
					</div>
				</div>

				<div className="landing-footer-meta">
					<p>© {new Date().getFullYear()} swyft.fun</p>
					<p>Not investment advice. Non-custodial — you approve every trade.</p>
					<button
						type="button"
						className="landing-footer-risk"
						onClick={() =>
							document
								.getElementById("landing-cta")
								?.scrollIntoView({ behavior: "smooth", block: "start" })
						}
					>
						Read risk disclosure →
					</button>
				</div>
			</footer>
		</div>
	);
}

function HeroSection({
	onSignIn,
	signingIn,
	ctaLabel,
}: {
	onSignIn: () => void;
	signingIn?: boolean;
	ctaLabel: string;
}) {
	return (
		<section className="landing-section landing-hero">
			<div
				className="landing-copy landing-reveal is-in"
				style={{ "--d": "80ms" } as CSSProperties}
			>
				<h1>
					Investing for <em>Everyone</em>
				</h1>
				<p>
					Share your goals, choose the ideas you like, and build your portfolio
					in 2 minutes.
				</p>
				<button
					type="button"
					className="landing-cta"
					onClick={onSignIn}
					disabled={signingIn}
				>
					{ctaLabel}
				</button>
				<small>Simple to start. No minimum amount required.</small>
			</div>

			<div
				className="landing-reveal is-in"
				style={{ "--d": "180ms" } as CSSProperties}
			>
				<LandingBasketDeck />
			</div>
		</section>
	);
}

function PerformanceSection() {
	const ref = useRef<HTMLElement>(null);
	const inView = useInView(ref);
	const [currency, setCurrency] = useState(LANDING_CURRENCIES[0]!);
	const [open, setOpen] = useState(false);

	return (
		<section
			ref={ref}
			className={`landing-section landing-perf landing-reveal${inView ? " is-in" : ""}`}
			id="landing-perf"
		>
			<header className="landing-section-head">
				<h2>See what your money could have done.</h2>
				<p>
					Compare the USD value of local cash with 3-month U.S. T-Bills and real
					swyft.fun portfolio histories.
				</p>
			</header>

			<div className={`landing-perf-card${inView ? " is-drawn" : ""}`}>
				<div className="landing-perf-meta">
					<p>
						Start: August 2021 (5 Years). Starting value: <b>$10,000</b>
					</p>
					<ul className="landing-perf-legend">
						<li>
							<i style={{ background: "#3dd6c3" }} /> Modern Warfare Portfolio
						</li>
						<li>
							<i style={{ background: "#f5c542" }} /> Trump Portfolio
						</li>
						<li>
							<i style={{ background: "#5eb0ff" }} /> S&amp;P 500
						</li>
						<li>
							<i style={{ background: "#ff7b72" }} /> {currency.code} cash
						</li>
					</ul>
				</div>

				<div className="landing-perf-plot">
					<PerformanceChart active={inView} />
					<div className="landing-perf-currency">
						<button
							type="button"
							className="landing-currency-trigger"
							aria-expanded={open}
							onClick={() => setOpen((value) => !value)}
						>
							<span aria-hidden="true">{currency.flag}</span>
							{currency.code} {currency.name}
							<ChevronDown size={16} />
						</button>
						{open ? (
							<ul className="landing-currency-menu" role="listbox">
								{LANDING_CURRENCIES.map((item) => (
									<li key={item.code}>
										<button
											type="button"
											className={item.code === currency.code ? "active" : ""}
											onClick={() => {
												setCurrency(item);
												setOpen(false);
											}}
										>
											<span aria-hidden="true">{item.flag}</span>
											<b>{item.code}</b>
											<span>{item.name}</span>
										</button>
									</li>
								))}
							</ul>
						) : null}
					</div>
				</div>

				<p className="landing-perf-note">
					<Info size={14} /> Historical, normalized comparison. Local cash shows
					the USD value of the same starting local-currency balance; it is not an
					inflation index. Portfolio performance is illustrative.
				</p>
			</div>
		</section>
	);
}

function PerformanceChart({ active }: { active: boolean }) {
	const width = 720;
	const height = 280;
	const pad = { top: 16, right: 88, bottom: 28, left: 44 };
	const series = [
		{ key: "modernWarfare", color: "#3dd6c3", end: LANDING_PERF_ENDINGS.modernWarfare, points: LANDING_PERF_SERIES.modernWarfare },
		{ key: "trump", color: "#f5c542", end: LANDING_PERF_ENDINGS.trump, points: LANDING_PERF_SERIES.trump },
		{ key: "sp500", color: "#5eb0ff", end: LANDING_PERF_ENDINGS.sp500, points: LANDING_PERF_SERIES.sp500 },
		{ key: "cash", color: "#ff7b72", end: LANDING_PERF_ENDINGS.cash, points: LANDING_PERF_SERIES.cash },
	] as const;

	function toPath(values: readonly number[]) {
		return values
			.map((value, i) => {
				const x =
					pad.left +
					(i / Math.max(values.length - 1, 1)) *
						(width - pad.left - pad.right);
				const y =
					pad.top + (1 - value) * (height - pad.top - pad.bottom);
				return `${i === 0 ? "M" : "L"}${x},${y}`;
			})
			.join(" ");
	}

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			className="landing-perf-svg"
			role="img"
			aria-label="Portfolio performance comparison"
		>
			<title>Historical performance comparison</title>
			{[0, 0.33, 0.66, 1].map((t) => {
				const y = pad.top + t * (height - pad.top - pad.bottom);
				return (
					<line
						key={t}
						x1={pad.left}
						x2={width - pad.right}
						y1={y}
						y2={y}
						className="landing-perf-grid"
					/>
				);
			})}
			{series.map((item, index) => {
				const last = item.points[item.points.length - 1] ?? 0;
				const x = width - pad.right + 8;
				const y = pad.top + (1 - last) * (height - pad.top - pad.bottom);
				return (
					<g key={item.key}>
						<path
							d={toPath(item.points)}
							fill="none"
							stroke={item.color}
							strokeWidth="2.4"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="landing-perf-line"
							style={{ "--i": index } as CSSProperties}
							pathLength={1}
						/>
						{active ? (
							<text
								x={x}
								y={y}
								className="landing-perf-end"
								style={{ fill: item.color, "--i": index } as CSSProperties}
							>
								${item.end.toLocaleString("en-US")}
							</text>
						) : null}
					</g>
				);
			})}
			<text x={pad.left} y={height - 6} className="landing-perf-axis">
				2021
			</text>
			<text
				x={width - pad.right}
				y={height - 6}
				textAnchor="end"
				className="landing-perf-axis"
			>
				Today
			</text>
		</svg>
	);
}

function AssetsSection({ onExplore }: { onExplore: () => void }) {
	const ref = useRef<HTMLElement>(null);
	const inView = useInView(ref);

	return (
		<section
			ref={ref}
			id="landing-assets"
			className={`landing-section landing-assets landing-reveal${inView ? " is-in" : ""}`}
		>
			<header className="landing-assets-head">
				<div>
					<p className="landing-assets-count">
						{STELLAR_SUPPORTED_ASSET_COUNT} assets on Stellar
					</p>
					<h2>Assets for every strategy.</h2>
					<p>
						{STELLAR_SUPPORTED_ASSET_COUNT} tokenized RWAs are live on Stellar
						today — stocks, ETFs, commodities, and FX — ready to swipe into a
						vault with USDC.
					</p>
				</div>
				<button type="button" className="landing-explore" onClick={onExplore}>
					Explore assets
					<ChevronRight size={16} />
				</button>
			</header>

			<div className="landing-assets-grid">
				{LANDING_ASSET_CLASSES.map((asset, index) => (
					<article
						key={asset.id}
						className={`landing-asset-card${asset.wide ? " is-wide" : ""}`}
						style={{ "--i": index } as CSSProperties}
					>
						<span className="landing-asset-tag">{asset.tag}</span>
						<h3>{asset.title}</h3>
						<p>{asset.description}</p>
						<footer>
							<ul className="landing-asset-logos">
								{asset.symbols.map((symbol) => (
									<li key={symbol}>
										<TickerLogo symbol={symbol} />
									</li>
								))}
							</ul>
							<small>{asset.summary}</small>
						</footer>
					</article>
				))}
			</div>
		</section>
	);
}

function AiPortfolioSection({ onSignIn }: { onSignIn: () => void }) {
	const ref = useRef<HTMLElement>(null);
	const inView = useInView(ref);
	const typed = useTypewriter(
		LANDING_AI_PORTFOLIO.prompt,
		inView,
		38,
	);

	return (
		<section
			ref={ref}
			className={`landing-section landing-ai landing-reveal${inView ? " is-in" : ""}`}
		>
			<div className="landing-ai-copy">
				<h2>Your idea can be a portfolio.</h2>
				<p>Describe a view. Get an editable basket with clear reasoning.</p>
				<label className="landing-ai-input">
					<span className="sr-only">Portfolio idea</span>
					<span className="landing-ai-typed">
						{typed}
						<span className="landing-ai-caret" aria-hidden="true" />
					</span>
					<button type="button" onClick={onSignIn} aria-label="Generate portfolio">
						<ChevronRight size={18} />
					</button>
				</label>
			</div>

			<article className={`landing-ai-card${inView ? " is-ready" : ""}`}>
				<header>
					<div>
						<span>AI-generated portfolio</span>
						<h3>{LANDING_AI_PORTFOLIO.title}</h3>
					</div>
					<strong>100%</strong>
				</header>
				<ul>
					{LANDING_AI_PORTFOLIO.holdings.map((holding, index) => (
						<li
							key={holding.symbol}
							style={{ "--i": index } as CSSProperties}
						>
							<TickerLogo symbol={holding.logoSymbol} />
							<div>
								<b>{holding.name}</b>
								<small>{holding.symbol}</small>
							</div>
							<span>{holding.weight}%</span>
						</li>
					))}
				</ul>
				<footer>
					<button type="button" onClick={onSignIn}>
						Why these assets?
					</button>
					<button type="button" onClick={onSignIn}>
						Editable
					</button>
				</footer>
			</article>
		</section>
	);
}

function MoneyFlowSection() {
	const ref = useRef<HTMLElement>(null);
	const inView = useInView(ref);
	const [payIndex, setPayIndex] = useState(2);

	useEffect(() => {
		if (!inView) return;
		const timer = window.setInterval(() => {
			setPayIndex((value) => (value + 1) % 3);
		}, 2200);
		return () => window.clearInterval(timer);
	}, [inView]);

	const methods = [
		{ id: "card", title: "Bank card", sub: "Visa or Mastercard" },
		{ id: "transfer", title: "Bank transfer", sub: "From your bank account" },
		{ id: "stable", title: "Stablecoins", sub: "USDC on Stellar" },
	] as const;

	return (
		<section
			ref={ref}
			className={`landing-section landing-money landing-reveal${inView ? " is-in" : ""}`}
		>
			<h2>Money in, money out. It&apos;s that easy.</h2>
			<div className="landing-money-grid">
				<article className="landing-money-card">
					<span className="landing-money-kicker">
						<CreditCard size={14} /> Payment methods
					</span>
					<h3>Add money from anywhere.</h3>
					<p>Top up with a bank card, bank transfer, or stablecoins.</p>
					<ul className="landing-pay-list">
						{methods.map((method, index) => (
							<li
								key={method.id}
								className={index === payIndex ? "is-active" : ""}
							>
								<div>
									<b>{method.title}</b>
									<small>
										{method.id === "stable" ? (
											<>
												<StableTokenLabel token="USDC" /> on Stellar
											</>
										) : (
											method.sub
										)}
									</small>
								</div>
								{method.id === "stable" ? (
									<span className="landing-pay-marks" aria-hidden="true">
										<TickerLogo symbol="USDC" />
									</span>
								) : null}
							</li>
						))}
					</ul>
				</article>

				<article className="landing-money-card">
					<span className="landing-money-kicker">
						<Wallet size={14} /> Your money, your rules
					</span>
					<h3>Withdraw anytime.</h3>
					<p>Move funds back to your bank or Stellar wallet when you need.</p>
					<div className={`landing-ring${inView ? " is-drawn" : ""}`}>
						<svg viewBox="0 0 120 120" aria-hidden="true">
							<circle cx="60" cy="60" r="46" className="landing-ring-track" />
							<circle cx="60" cy="60" r="46" className="landing-ring-value" />
						</svg>
						<div>
							<strong>$500</strong>
							<small>available</small>
						</div>
					</div>
				</article>
			</div>
		</section>
	);
}

function CtaBanner({
	onSignIn,
	signingIn,
	signedIn,
}: {
	onSignIn: () => void;
	signingIn?: boolean;
	signedIn?: boolean;
}) {
	const ref = useRef<HTMLElement>(null);
	const inView = useInView(ref);
	const basket = LANDING_BASKETS[0]!;

	return (
		<section
			ref={ref}
			id="landing-cta"
			className={`landing-section landing-banner landing-reveal${inView ? " is-in" : ""}`}
		>
			<div className="landing-banner-inner">
				<div className="landing-banner-copy">
					<h2>Build your first portfolio in 2 minutes.</h2>
					<p>No minimum amount required. Available 24/7 on Stellar.</p>
					<button
						type="button"
						className="landing-banner-cta"
						onClick={onSignIn}
						disabled={signingIn}
					>
						{signingIn ? "Connecting…" : signedIn ? "Continue" : "Start now"}
						<ChevronRight size={18} />
					</button>
				</div>
				<article className="landing-banner-card">
					<LandingBasketCard basket={basket} compact />
				</article>
			</div>
		</section>
	);
}

function FaqSection() {
	const ref = useRef<HTMLElement>(null);
	const inView = useInView(ref);
	const [openId, setOpenId] = useState("custody");

	return (
		<section
			ref={ref}
			id="landing-faqs"
			className={`landing-section landing-faqs landing-reveal${inView ? " is-in" : ""}`}
		>
			<h2>FAQs</h2>
			<div className="landing-faq-list">
				{LANDING_FAQS.map((faq) => {
					const open = faq.id === openId;
					return (
						<div key={faq.id} className={`landing-faq${open ? " is-open" : ""}`}>
							<button
								type="button"
								aria-expanded={open}
								onClick={() => setOpenId(open ? "" : faq.id)}
							>
								<span>{faq.question}</span>
								{open ? <Minus size={18} /> : <Plus size={18} />}
							</button>
							<div className="landing-faq-answer">
								<p>{faq.answer}</p>
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}

function useInView(ref: RefObject<HTMLElement | null>, threshold = 0.22) {
	const [inView, setInView] = useState(false);
	useEffect(() => {
		const node = ref.current;
		if (!node || inView) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) {
					setInView(true);
					observer.disconnect();
				}
			},
			{ threshold, rootMargin: "0px 0px -8% 0px" },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [ref, threshold, inView]);
	return inView;
}

function useTypewriter(text: string, active: boolean, ms = 36) {
	const [value, setValue] = useState("");
	useEffect(() => {
		if (!active) {
			setValue("");
			return;
		}
		let i = 0;
		setValue("");
		const timer = window.setInterval(() => {
			i += 1;
			setValue(text.slice(0, i));
			if (i >= text.length) window.clearInterval(timer);
		}, ms);
		return () => window.clearInterval(timer);
	}, [text, active, ms]);
	return value;
}
