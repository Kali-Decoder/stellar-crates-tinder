import { CircleHelp, Heart, X } from "lucide-react";
import {
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Candidate } from "../../domain/schemas";
import {
	type AssetDetailsResponse,
	type AssetHistoryResponse,
	api,
	type HistoryPeriod,
} from "../api";
import {
	type ChartPoint,
	chartPointsAttribute,
	chartPointsFromPrices,
	chartPolygonAttribute,
	interpolateChartPoints,
} from "../chart-animation";
import {
	chartDateLabels,
	chartPriceTicks,
	HISTORY_PERIOD_SECONDS,
	HISTORY_PERIODS,
	historySpanSeconds,
	isHistoryPeriodAvailable,
} from "../chart-history";
import { formatChartAxisUsdPrice, formatUsdPrice } from "../price-format";
import {
	type DiaFeedInfo,
	diaFeedAgeSec,
	fetchDiaFeedInfo,
	formatDiaClock,
	formatDiaUpdatedAt,
} from "../stellar/dia-api";
import { AssetMark } from "./AssetMark";
import { StableTokenLabel } from "./StableTokenLabel";
import { unlockSwipeAudio } from "../swipe-sounds";

const SWIPE_THRESHOLD_PX = 72;
const LOADING_DOTS = Array.from({ length: 32 }, (_, index) => index);
const CHART_MORPH_DURATION_MS = 420;
type DecisionFeedback = "invest" | "skip";

function shortDate(timestamp: number) {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
	}).format(new Date(timestamp * 1000));
}

function shortMonthYear(timestamp: number) {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		year: "numeric",
	}).format(new Date(timestamp * 1000));
}

function oneMonthAfter(timestamp: number) {
	const date = new Date(timestamp * 1000);
	date.setUTCMonth(date.getUTCMonth() + 1);
	return Math.floor(date.getTime() / 1000);
}

const CHART_TICK_Y = [5, 12.67, 20.33, 28];
const compactUsdFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	notation: "compact",
	maximumFractionDigits: 2,
});

function ChartShape({
	points,
	prices,
	timestamps,
	label,
	isDown,
	onScrub,
}: {
	points: ChartPoint[];
	prices: number[];
	timestamps: number[];
	label: string;
	isDown: boolean;
	onScrub: (payload: { price: number; timestamp: number } | null) => void;
}) {
	const polygonRef = useRef<SVGPolygonElement>(null);
	const lineRef = useRef<SVGPolylineElement>(null);
	const frameRef = useRef<number | undefined>(undefined);
	const currentPointsRef = useRef(points);
	const plotRef = useRef<HTMLDivElement>(null);
	const [scrubIndex, setScrubIndex] = useState<number | null>(null);
	const gradientId = useId().replace(/:/g, "");

	useLayoutEffect(() => {
		const polygon = polygonRef.current;
		const line = lineRef.current;
		if (!polygon || !line || !points.length) return;

		if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
		const from = currentPointsRef.current;
		const applyPoints = (next: ChartPoint[]) => {
			line.setAttribute("points", chartPointsAttribute(next));
			polygon.setAttribute("points", chartPolygonAttribute(next));
			currentPointsRef.current = next;
		};
		const reducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		if (
			!from.length ||
			reducedMotion ||
			chartPointsAttribute(from) === chartPointsAttribute(points)
		) {
			applyPoints(points);
			return;
		}

		applyPoints(from);
		const startedAt = performance.now();
		const animate = (timestamp: number) => {
			const elapsed = Math.min(
				1,
				(timestamp - startedAt) / CHART_MORPH_DURATION_MS,
			);
			const eased = 1 - (1 - elapsed) ** 3;
			applyPoints(interpolateChartPoints(from, points, eased));
			if (elapsed < 1) frameRef.current = requestAnimationFrame(animate);
			else frameRef.current = undefined;
		};
		frameRef.current = requestAnimationFrame(animate);
		return () => {
			if (frameRef.current !== undefined)
				cancelAnimationFrame(frameRef.current);
		};
	}, [points]);

	const tip = points.at(-1);
	const scrubPoint =
		scrubIndex !== null ? (points[scrubIndex] ?? tip) : undefined;
	const line = chartPointsAttribute(points);

	function indexFromClientX(clientX: number) {
		const el = plotRef.current;
		if (!el || !points.length) return null;
		const rect = el.getBoundingClientRect();
		const xPct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		return Math.round(xPct * (points.length - 1));
	}

	function handlePointer(clientX: number) {
		const index = indexFromClientX(clientX);
		if (index === null) return;
		setScrubIndex(index);
		const price = prices[index];
		const timestamp = timestamps[index];
		if (price !== undefined && timestamp !== undefined) {
			onScrub({ price, timestamp });
		}
	}

	function clearScrub() {
		setScrubIndex(null);
		onScrub(null);
	}

	return (
		<div
			ref={plotRef}
			className="chart-plot-surface"
			onPointerDown={(event) => {
				event.stopPropagation();
				event.currentTarget.setPointerCapture(event.pointerId);
				handlePointer(event.clientX);
			}}
			onPointerMove={(event) => {
				handlePointer(event.clientX);
			}}
			onPointerUp={clearScrub}
			onPointerCancel={clearScrub}
			onPointerLeave={clearScrub}
		>
			<svg
				viewBox="0 0 100 32"
				preserveAspectRatio="none"
				role="img"
				aria-label={label}
				className={isDown ? "is-down" : "is-up"}
			>
				<title>{label}</title>
				<defs>
					<linearGradient id={`fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
						<stop offset="100%" stopColor="currentColor" stopOpacity="0" />
					</linearGradient>
				</defs>
				{CHART_TICK_Y.map((y) => (
					<line
						className="chart-gridline"
						x1="0"
						x2="100"
						y1={y}
						y2={y}
						key={y}
					/>
				))}
				{line ? (
					<>
						<polygon
							ref={polygonRef}
							className="chart-area"
							points={chartPolygonAttribute(points)}
							fill={`url(#fill-${gradientId})`}
						/>
						<polyline ref={lineRef} className="chart-line" points={line} />
						{tip ? (
							<circle
								className="chart-tip"
								cx={tip.x}
								cy={tip.y}
								r="1.35"
							/>
						) : null}
						{scrubPoint ? (
							<>
								<line
									className="chart-scrub-line"
									x1={scrubPoint.x}
									x2={scrubPoint.x}
									y1="0"
									y2="32"
								/>
								<circle
									className="chart-scrub-dot"
									cx={scrubPoint.x}
									cy={scrubPoint.y}
									r="1.6"
								/>
							</>
						) : null}
					</>
				) : null}
			</svg>
		</div>
	);
}

function PriceSparkline({
	candidate,
	reason,
	infoOpen,
	onInfoOpenChange,
}: {
	candidate: Candidate;
	reason: string;
	infoOpen: boolean;
	onInfoOpenChange: (open: boolean) => void;
}) {
	const [period, setPeriod] = useState<HistoryPeriod>("1M");
	const [history, setHistory] = useState<AssetHistoryResponse>();
	const [coverageHistory, setCoverageHistory] =
		useState<AssetHistoryResponse>();
	const [retryCount, setRetryCount] = useState(0);
	const [details, setDetails] = useState<AssetDetailsResponse>();
	const [detailsFailed, setDetailsFailed] = useState(false);
	const [diaFeed, setDiaFeed] = useState<DiaFeedInfo>();
	const [diaFeedFailed, setDiaFeedFailed] = useState(false);
	const [nowTick, setNowTick] = useState(() => Date.now());
	const [scrub, setScrub] = useState<{
		price: number;
		timestamp: number;
	} | null>(null);

	useEffect(() => {
		let active = true;
		setDiaFeed(undefined);
		setDiaFeedFailed(false);
		void fetchDiaFeedInfo(candidate.assetId)
			.then((info) => {
				if (!active) return;
				if (info) setDiaFeed(info);
				else setDiaFeedFailed(true);
			})
			.catch(() => active && setDiaFeedFailed(true));
		return () => {
			active = false;
		};
	}, [candidate.assetId]);

	useEffect(() => {
		const timer = window.setInterval(() => setNowTick(Date.now()), 30_000);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		if (!infoOpen || details || detailsFailed) return;
		let active = true;
		void api
			.assetDetails(candidate.assetId)
			.then((result) => active && setDetails(result))
			.catch(() => active && setDetailsFailed(true));
		return () => {
			active = false;
		};
	}, [candidate.assetId, details, detailsFailed, infoOpen]);

	useEffect(() => {
		if (!infoOpen) return;
		void fetchDiaFeedInfo(candidate.assetId, { refresh: true })
			.then((info) => info && setDiaFeed(info))
			.catch(() => undefined);
	}, [candidate.assetId, infoOpen]);

	useEffect(() => {
		let active = true;
		setCoverageHistory(undefined);
		void api
			.assetHistory(candidate.assetId, "1Y", retryCount > 0)
			.then((result) => active && setCoverageHistory(result))
			.catch(
				() =>
					active &&
					setCoverageHistory({
						period: "1Y",
						source: "unavailable",
						points: [],
					}),
			);
		return () => {
			active = false;
		};
	}, [candidate.assetId, retryCount]);

	useEffect(() => {
		if (!coverageHistory) return;
		setPeriod((current) =>
			isHistoryPeriodAvailable(current, coverageHistory) ? current : "ALL",
		);
	}, [coverageHistory]);

	useEffect(() => {
		let active = true;
		setHistory((current) =>
			current?.source === "unavailable" ? undefined : current,
		);
		void api
			.assetHistory(candidate.assetId, period, retryCount > 0)
			.then((result) => active && setHistory(result))
			.catch(
				() =>
					active && setHistory({ period, source: "unavailable", points: [] }),
			);
		return () => {
			active = false;
		};
	}, [candidate.assetId, period, retryCount]);

	const prices = useMemo(
		() => history?.points.map((point) => point.price) ?? [],
		[history],
	);
	const timestamps = useMemo(
		() => history?.points.map((point) => point.timestamp) ?? [],
		[history],
	);
	const chartPoints = useMemo(() => chartPointsFromPrices(prices), [prices]);
	const priceTicks = useMemo(() => chartPriceTicks(prices), [prices]);
	const first = prices[0];
	const last = prices.at(-1);
	const displayPrice =
		scrub?.price ??
		diaFeed?.price ??
		last ??
		candidate.marketPriceUsd ??
		0;
	const change = first && last ? ((last - first) / first) * 100 : 0;
	const dateLabels = chartDateLabels(history);
	const coverageSpan = historySpanSeconds(coverageHistory);
	const coverageDays = Math.max(1, Math.round(coverageSpan / (24 * 60 * 60)));
	const isNewToken =
		coverageHistory?.source === "dia" &&
		coverageSpan < HISTORY_PERIOD_SECONDS["1M"];
	const firstTimestamp = coverageHistory?.points[0]?.timestamp;
	const oneMonthUnlock = firstTimestamp
		? oneMonthAfter(firstTimestamp)
		: undefined;
	const displayPeriod = history?.period ?? period;
	const periodLabel =
		displayPeriod === "ALL" && history?.points[0]
			? `${history.isCompleteHistory === false ? "Max available · " : ""}Since ${shortMonthYear(history.points[0].timestamp)}`
			: displayPeriod;
	const chartLabel = `${candidate.symbol} ${periodLabel} price chart`;
	const loading = history === undefined;
	const unavailable = history?.source === "unavailable";
	const isDown = change < 0;
	const scrubDate =
		scrub !== null
			? new Intl.DateTimeFormat("en-US", {
					month: "short",
					day: "numeric",
					hour: period === "1H" || period === "1D" ? "numeric" : undefined,
					minute: period === "1H" || period === "1D" ? "2-digit" : undefined,
				}).format(new Date(scrub.timestamp * 1000))
			: null;
	const feedStale =
		diaFeed !== undefined && diaFeedAgeSec(diaFeed.timestamp, nowTick) > 6 * 3600;

	useEffect(() => {
		if (!unavailable || retryCount >= 2) return;
		const timer = window.setTimeout(
			() => setRetryCount((count) => count + 1),
			2_000,
		);
		return () => window.clearTimeout(timer);
	}, [retryCount, unavailable]);

	useEffect(() => {
		setScrub(null);
	}, [candidate.assetId, period]);

	return (
		<div
			className={`price-chart${isDown ? " is-down" : " is-up"}${infoOpen ? " has-info" : ""}${scrub ? " is-scrubbing" : ""}`}
		>
			<div className={`chart-meta${isNewToken ? " has-coverage" : ""}`}>
				<strong>{formatUsdPrice(displayPrice)}</strong>
				<span className={isDown ? "is-down" : "is-up"}>
					{scrubDate
						? scrubDate
						: prices.length
							? `${change >= 0 ? "+" : ""}${change.toFixed(2)}% · ${periodLabel}`
							: "—"}
					{!scrubDate && history?.source === "dia" ? (
						<em className="chart-source">DIA</em>
					) : null}
				</span>
				{isNewToken ? (
					<div className="chart-coverage">
						<i aria-hidden="true" />
						New · {coverageDays} {coverageDays === 1 ? "day" : "days"}
					</div>
				) : null}
			</div>
			{unavailable ? (
				<div className="chart-unavailable" role="status">
					<strong>Price history unavailable</strong>
					<span>DIA market data is temporarily unavailable.</span>
					<button
						type="button"
						onClick={() => setRetryCount((count) => count + 1)}
					>
						Retry
					</button>
				</div>
			) : loading ? (
				<>
					<div className="chart-loading" role="status" aria-live="polite">
						<span className="sr-only">
							Loading {period === "ALL" ? "all" : period} price history
						</span>
						<div className="chart-loading-dots" aria-hidden="true">
							{LOADING_DOTS.map((index) => (
								<i
									key={index}
									style={{
										animationDelay: `${(3 - Math.floor(index / 8)) * 90}ms`,
									}}
								/>
							))}
						</div>
					</div>
					<div
						className="chart-dates chart-dates-placeholder"
						aria-hidden="true"
					>
						<span>&nbsp;</span>
						<span>&nbsp;</span>
					</div>
				</>
			) : (
				<>
					<div className="chart-plot">
						<ChartShape
							points={chartPoints}
							prices={prices}
							timestamps={timestamps}
							label={chartLabel}
							isDown={isDown}
							onScrub={setScrub}
						/>
						<div className="chart-prices" aria-hidden="true">
							{CHART_TICK_Y.map((y, index) => (
								<span style={{ top: `${(y / 32) * 100}%` }} key={y}>
									{formatChartAxisUsdPrice(priceTicks[index] ?? 0)}
								</span>
							))}
						</div>
					</div>
					{dateLabels.length ? (
						<fieldset className="chart-dates">
							<legend className="sr-only">
								{periodLabel} chart date range
							</legend>
							<span>{dateLabels[0]}</span>
							<span>{dateLabels[1]}</span>
						</fieldset>
					) : null}
					{history.period !== period ? (
						<span className="sr-only" role="status">
							Loading {period} price history
						</span>
					) : null}
				</>
			)}
			<p className="chart-hint">Hold &amp; drag to scrub · DIA live spot</p>
			{diaFeed ? (
				<div
					className={`dia-feed-strip${feedStale ? " is-stale" : ""}`}
					aria-label="DIA oracle feed"
				>
					<span className="dia-feed-badge">DIA</span>
					<span className="dia-feed-key">{diaFeed.feedKey}</span>
					<span className="dia-feed-meta">{diaFeed.type}</span>
					<span className="dia-feed-meta dia-feed-endpoint" title={diaFeed.endpoint}>
						{diaFeed.endpoint}
					</span>
					<span className="dia-feed-price">{formatUsdPrice(diaFeed.price)}</span>
					<span
						className="dia-feed-age"
						title={diaFeed.updatedAtIso}
					>
						{formatDiaUpdatedAt(diaFeed.timestamp, nowTick)}
						<span className="dia-feed-clock">
							· {formatDiaClock(diaFeed.timestamp)}
						</span>
					</span>
				</div>
			) : diaFeedFailed ? (
				<div className="dia-feed-strip is-muted" aria-label="DIA oracle feed">
					<span className="dia-feed-badge">DIA</span>
					<span>Oracle feed unavailable</span>
				</div>
			) : (
				<div className="dia-feed-strip is-muted" aria-label="DIA oracle feed">
					<span className="dia-feed-badge">DIA</span>
					<span>Loading oracle feed…</span>
				</div>
			)}
			<div className="chart-controls">
				<fieldset
					className="chart-timeframes"
					onPointerDown={(event) => event.stopPropagation()}
				>
					<legend className="sr-only">Chart timeframe</legend>
					{HISTORY_PERIODS.map((option) => {
						const disabled = !isHistoryPeriodAvailable(option, coverageHistory);
						const unlockLabel =
							option === "1M" && oneMonthUnlock
								? ` Available ${shortDate(oneMonthUnlock)}.`
								: "";
						return (
							<button
								type="button"
								aria-pressed={period === option}
								aria-label={`${option === "ALL" ? "All" : option} timeframe.${disabled ? ` Not enough price history.${unlockLabel}` : ""}`}
								disabled={disabled}
								onClick={() => setPeriod(option)}
								key={option}
							>
								{option === "ALL" ? "All" : option}
							</button>
						);
					})}
				</fieldset>
				<button
					type="button"
					className="chart-reason-toggle"
					aria-label="Asset information"
					aria-expanded={infoOpen}
					onClick={() => onInfoOpenChange(!infoOpen)}
				>
					<CircleHelp aria-hidden="true" />
				</button>
			</div>
			{infoOpen ? (
				<div className="asset-info-panel" aria-live="polite">
					{diaFeed ? (
						<>
							<div className="asset-info-tags">
								<div>
									<span className="asset-tag is-tokenized">DIA Oracle</span>
									<span className="asset-tag is-neutral">{diaFeed.type}</span>
									<span className="asset-tag is-neutral">{diaFeed.feedKey}</span>
									{feedStale ? (
										<span className="asset-tag is-stale">Stale feed</span>
									) : (
										<span className="asset-tag is-live">Live</span>
									)}
								</div>
							</div>
							<div className="asset-info-metrics">
								<dl>
									<div>
										<dt>Spot:</dt>
										<dd>{formatUsdPrice(diaFeed.price)}</dd>
									</div>
									<div>
										<dt>Ticker:</dt>
										<dd>{diaFeed.ticker}</dd>
									</div>
								</dl>
								<dl>
									<div>
										<dt>Updated:</dt>
										<dd title={diaFeed.updatedAtIso}>
											{formatDiaUpdatedAt(diaFeed.timestamp, nowTick)}
										</dd>
									</div>
									<div>
										<dt>Clock:</dt>
										<dd title={diaFeed.updatedAtIso}>
											{formatDiaClock(diaFeed.timestamp)}
										</dd>
									</div>
								</dl>
								<dl>
									<div>
										<dt>Name:</dt>
										<dd>{diaFeed.name}</dd>
									</div>
									<div>
										<dt>Oracle key:</dt>
										<dd>{diaFeed.feedKey}</dd>
									</div>
								</dl>
								<dl>
									<div>
										<dt>Endpoint:</dt>
										<dd title={diaFeed.restPath}>{diaFeed.endpoint}</dd>
									</div>
									<div>
										<dt>Source:</dt>
										<dd>DIA RWA REST</dd>
									</div>
								</dl>
							</div>
							<div className="asset-info-link-row">
								<strong>Feed:</strong>
								<div>
									<a
										href={`https://api.diadata.org${diaFeed.restPath.replace(/^\/dia-api/, "")}`}
										target="_blank"
										rel="noopener noreferrer"
									>
										Open DIA quote ↗
									</a>
									<a
										href="https://www.diadata.org/docs/reference/apis/rwa-prices"
										target="_blank"
										rel="noopener noreferrer"
									>
										RWA docs ↗
									</a>
								</div>
							</div>
							<p className="asset-info-reason">
								Live spot from DIA&apos;s RWA API ({diaFeed.endpoint}). Chart
								path is market history anchored to this oracle price for vault
								key {diaFeed.feedKey}.
							</p>
							<p className="asset-info-reason">{reason}</p>
						</>
					) : !diaFeedFailed ? (
						<p className="asset-info-status">Loading DIA oracle feed…</p>
					) : detailsFailed ? (
						<p className="asset-info-status">Asset details are unavailable.</p>
					) : !details ? (
						<p className="asset-info-status">Loading asset details…</p>
					) : (
						<>
							<div className="asset-info-metrics">
								<dl>
									<div>
										<dt>Market Cap:</dt>
										<dd>
											{details.marketCapUsd !== undefined
												? compactUsdFormatter.format(details.marketCapUsd)
												: "—"}
										</dd>
									</div>
									<div>
										<dt>24H Volume:</dt>
										<dd>
											{(candidate.volume24hUsd ?? details.volume24hUsd)
												? compactUsdFormatter.format(
														candidate.volume24hUsd ??
															details.volume24hUsd ??
															0,
													)
												: "—"}
										</dd>
									</div>
								</dl>
							</div>
							<p className="asset-info-reason">{reason}</p>
						</>
					)}
				</div>
			) : null}
			{isNewToken ? (
				<div className="chart-coverage-note">
					<span>Only {coverageDays} days of history</span>
					{oneMonthUnlock ? (
						<span>1M available {shortDate(oneMonthUnlock)}</span>
					) : null}
				</div>
			) : null}
		</div>
	);
}

export function SwipeCard({
	candidate,
	reason,
	ticketSizeUsd,
	stableToken,
	feedback,
	infoOpen,
	onInfoOpenChange,
	onSwipe,
	canAdd = true,
}: {
	candidate: Candidate;
	reason: string;
	ticketSizeUsd: number;
	stableToken: "USDG" | "USDC";
	feedback?: DecisionFeedback;
	infoOpen: boolean;
	onInfoOpenChange: (open: boolean) => void;
	onSwipe: (add: boolean) => void;
	canAdd?: boolean;
}) {
	const pointerStart = useRef<{ id: number; x: number } | undefined>(undefined);
	const [dragX, setDragX] = useState(0);
	const busy = Boolean(feedback);

	function resetDrag() {
		pointerStart.current = undefined;
		setDragX(0);
	}

	return (
		<article
			className={`swipe-card${dragX ? " is-dragging" : ""}${feedback ? ` is-${feedback}` : ""}${dragX < -24 ? " is-lean-skip" : ""}${dragX > 24 ? " is-lean-add" : ""}`}
			style={{ transform: `translateX(${dragX}px) rotate(${dragX / 28}deg)` }}
			onPointerDown={(event) => {
				if (feedback || (event.target as HTMLElement).closest("button, a"))
					return;
				unlockSwipeAudio();
				pointerStart.current = { id: event.pointerId, x: event.clientX };
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerMove={(event) => {
				if (
					!pointerStart.current ||
					pointerStart.current.id !== event.pointerId
				)
					return;
				setDragX(
					Math.max(-140, Math.min(140, event.clientX - pointerStart.current.x)),
				);
			}}
			onPointerUp={(event) => {
				if (
					!pointerStart.current ||
					pointerStart.current.id !== event.pointerId
				)
					return;
				const distance = event.clientX - pointerStart.current.x;
				resetDrag();
				if (Math.abs(distance) >= SWIPE_THRESHOLD_PX) {
					if (distance > 0 && !canAdd) return;
					onSwipe(distance > 0);
				}
			}}
			onPointerCancel={resetDrag}
		>
			{feedback ? (
				<div className={`card-decision-flash ${feedback}`} aria-live="polite">
					<div className="decision-confetti" aria-hidden="true">
						<i>✦</i>
						<i>✦</i>
						<i>✦</i>
					</div>
					<span>{feedback === "invest" ? "👍" : "👎"}</span>
					<b>{feedback === "invest" ? "In your basket" : "Skipped"}</b>
				</div>
			) : null}

			<div className="card-hover-actions" aria-hidden={busy}>
				<button
					type="button"
					className="card-hover-reject"
					onClick={() => onSwipe(false)}
					disabled={busy}
					aria-label="Reject asset"
				>
					<X size={32} strokeWidth={2.6} aria-hidden="true" />
				</button>
				<button
					type="button"
					className="card-hover-accept"
					onClick={() => onSwipe(true)}
					disabled={busy || !canAdd}
					aria-label="Add asset"
				>
					<Heart size={30} strokeWidth={2.4} fill="currentColor" aria-hidden="true" />
				</button>
			</div>

			<div
				className={`card-stamp card-stamp-nope${dragX < -24 ? " is-visible" : ""}`}
				aria-hidden="true"
			>
				Nope
			</div>
			<div
				className={`card-stamp card-stamp-like${dragX > 24 ? " is-visible" : ""}`}
				aria-hidden="true"
			>
				Add
			</div>

			<div className="card-head">
				<div className="asset-title">
					<AssetMark
						symbol={candidate.symbol}
						iconUrl={candidate.iconUrl}
						size="lg"
					/>
					<div>
						<h2>{candidate.symbol}</h2>
						<p>{candidate.name}</p>
					</div>
				</div>
				<div className="allocation-tags" aria-label={`Ticket ${ticketSizeUsd} ${stableToken}`}>
					<span className="allocation-tag allocation-tag-amount">
						{ticketSizeUsd}
					</span>
					<span className="allocation-tag allocation-tag-token">
						<StableTokenLabel token={stableToken} />
					</span>
				</div>
			</div>
			<PriceSparkline
				key={candidate.assetId}
				candidate={candidate}
				reason={reason}
				infoOpen={infoOpen}
				onInfoOpenChange={onInfoOpenChange}
			/>
		</article>
	);
}
