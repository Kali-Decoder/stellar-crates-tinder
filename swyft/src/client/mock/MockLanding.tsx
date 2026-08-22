import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { ThemeToggle } from "../components/ThemeToggle";
import { LANDING_BASKETS, type LandingBasket } from "./landing-data";

const LOGO_DEV =
	"https://img.logo.dev/ticker/";
const LOGO_TOKEN =
	"pk_Vd4Z_uMzQJCMUA21nk_6Gw";

export function MockLanding({
	onSignIn,
	signingIn,
	signedIn,
}: {
	onSignIn: () => void;
	signingIn?: boolean;
	signedIn?: boolean;
}) {
	const [index, setIndex] = useState(0);
	const [exitDir, setExitDir] = useState<"left" | "right" | null>(null);
	const basket = LANDING_BASKETS[index] ?? LANDING_BASKETS[0]!;

	useEffect(() => {
		if (!exitDir) return;
		const timer = window.setTimeout(() => {
			setIndex((value) => (value + 1) % LANDING_BASKETS.length);
			setExitDir(null);
		}, 320);
		return () => window.clearTimeout(timer);
	}, [exitDir]);

	function skip() {
		if (exitDir) return;
		setExitDir("left");
	}

	function add() {
		if (exitDir) return;
		setExitDir("right");
	}

	return (
		<div className="landing-page">
			<header className="landing-topbar">
				<div className="landing-brand">
					<span className="landing-logo">
						swyft.<span>fun</span>
					</span>
					<span className="landing-beta">BETA</span>
				</div>
				<div className="landing-top-actions">
					<ThemeToggle />
					<button
						type="button"
						className="landing-signin"
						onClick={onSignIn}
						disabled={signingIn}
					>
						{signingIn ? "Connecting…" : signedIn ? "Continue" : "Sign in"}
					</button>
				</div>
			</header>

			<main className="landing-hero">
				<section className="landing-copy">
					<h1>
						Investing for <em>Everyone</em>
					</h1>
					<p>
						Share your goals, choose the ideas you like, and build your
						portfolio in 2 minutes.
					</p>
					<button
						type="button"
						className="landing-cta"
						onClick={onSignIn}
						disabled={signingIn}
					>
						{signingIn ? "Connecting…" : signedIn ? "Continue" : "Sign in"}
					</button>
					<small>Simple to start. No minimum amount required.</small>
				</section>

				<section className="landing-deck" aria-label="Sample baskets">
					<div className="landing-stack" aria-hidden="true">
						<div className="landing-stack-card" />
						<div className="landing-stack-card" />
					</div>
					<article
						key={basket.id}
						className={`landing-card${exitDir ? ` is-exit-${exitDir}` : ""}`}
					>
						<LandingBasketCard basket={basket} />
						<div className="landing-card-actions">
							<button type="button" className="landing-skip" onClick={skip}>
								<ChevronLeft size={18} strokeWidth={2.2} />
								Skip
							</button>
							<button type="button" className="landing-add" onClick={add}>
								Add portfolio
								<ChevronRight size={18} strokeWidth={2.2} />
							</button>
						</div>
					</article>
					<div className="landing-dots" role="tablist" aria-label="Baskets">
						{LANDING_BASKETS.map((item, dotIndex) => (
							<button
								type="button"
								key={item.id}
								className={dotIndex === index ? "active" : ""}
								aria-label={`Show ${item.title}`}
								aria-current={dotIndex === index ? "true" : undefined}
								onClick={() => {
									if (!exitDir) setIndex(dotIndex);
								}}
							/>
						))}
					</div>
				</section>
			</main>
		</div>
	);
}

function LandingBasketCard({ basket }: { basket: LandingBasket }) {
	const up = basket.changePct >= 0;
	const chartColor = up ? "#7ee6a4" : "#ff7b72";
	const width = 320;
	const height = 120;
	const pad = 4;
	const coords = basket.points
		.map((value, i) => {
			const x =
				pad + (i / Math.max(basket.points.length - 1, 1)) * (width - pad * 2);
			const y = pad + (1 - value) * (height - pad * 2);
			return `${x},${y}`;
		})
		.join(" ");
	const area = `${pad},${height - pad} ${coords} ${width - pad},${height - pad}`;

	return (
		<>
			<header className="landing-card-head">
				<span className={`landing-card-icon is-${basket.icon}`} aria-hidden="true">
					<svg viewBox="0 0 40 40" width="40" height="40">
						{basket.icon === "mesh" ? (
							<path
								fill="currentColor"
								d="M8 20c4-8 20-8 24 0-4 8-20 8-24 0Zm4.5 0c2.5-4.5 10.5-4.5 13 0-2.5 4.5-10.5 4.5-13 0Zm4.2 0c1.2-2 4.9-2 6.1 0-1.2 2-4.9 2-6.1 0Z"
							/>
						) : basket.icon === "bolt" ? (
							<path fill="currentColor" d="M22 6 10 22h8l-2 12 14-18h-9l3-10Z" />
						) : basket.icon === "leaf" ? (
							<path
								fill="currentColor"
								d="M32 8c-10 2-18 10-20 20 8-4 16-4 20-8-2 8-8 14-16 16 12 0 22-10 16-28Z"
							/>
						) : (
							<>
								<circle cx="20" cy="20" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
								<circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".55" />
								<circle cx="20" cy="8" r="2" fill="currentColor" />
							</>
						)}
					</svg>
				</span>
				<div>
					<h2>{basket.title}</h2>
					<p>{basket.subtitle}</p>
				</div>
			</header>

			<div className={`landing-chart${up ? "" : " is-down"}`}>
				<strong>
					{up ? "+" : ""}
					{basket.changePct.toFixed(2)}% · {basket.period}
				</strong>
				<div className="landing-chart-plot">
					<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${basket.title} chart`}>
						<title>{basket.title} performance</title>
						<polygon points={area} fill={chartColor} opacity="0.12" />
						<polyline
							points={coords}
							fill="none"
							stroke={chartColor}
							strokeWidth="2.4"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
					<div className="landing-chart-prices" aria-hidden="true">
						<span>${formatPrice(basket.range.high)}</span>
						<span>${formatPrice(basket.range.midHigh)}</span>
						<span>${formatPrice(basket.range.mid)}</span>
						<span>${formatPrice(basket.range.low)}</span>
					</div>
				</div>
				<div className="landing-chart-dates" aria-hidden="true">
					<span>{basket.dates.start}</span>
					<span>{basket.dates.end}</span>
				</div>
			</div>

			<div className="landing-holdings">
				<p>{basket.description}</p>
				<div className="landing-allocation" aria-hidden="true">
					{basket.holdings.map((holding) => (
						<span
							key={holding.symbol}
							style={{
								flexGrow: holding.weight,
								background: holding.color,
							}}
						/>
					))}
				</div>
				<ul className="landing-logos">
					{basket.holdings.map((holding) => (
						<li key={holding.symbol}>
							<img
								src={`${LOGO_DEV}${encodeURIComponent(holding.symbol)}?token=${LOGO_TOKEN}&size=64&format=png&theme=dark&retina=true&fallback=404`}
								alt={holding.symbol}
								onError={(event) => {
									const target = event.currentTarget;
									target.style.display = "none";
									const fallback = target.nextElementSibling;
									if (fallback instanceof HTMLElement) fallback.hidden = false;
								}}
							/>
							<span hidden aria-hidden="true">
								{holding.symbol.slice(0, 1)}
							</span>
						</li>
					))}
				</ul>
			</div>
		</>
	);
}

function formatPrice(value: number) {
	return value >= 100
		? value.toLocaleString("en-US", { maximumFractionDigits: 0 })
		: value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
