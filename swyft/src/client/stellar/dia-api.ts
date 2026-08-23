import catalogJson from "../../data/rwa-catalog.json";
import type { AssetHistoryResponse, HistoryPeriod } from "../api.js";

export type RwaAssetType = "Stock" | "ETF" | "Commodity" | "FX";

export type RwaCatalogEntry = {
	symbol: string;
	name: string;
	type: RwaAssetType;
};

export type DiaFeedInfo = {
	symbol: string;
	ticker: string;
	name: string;
	type: RwaAssetType;
	price: number;
	timestamp: number;
	updatedAtIso: string;
	feedKey: string;
	/** Proxy path used by the client, e.g. `/dia-api/v1/rwa/Equities/AAPL`. */
	restPath: string;
	/** Public DIA path segment, e.g. `Equities/AAPL`. */
	endpoint: string;
	source: "dia-rwa";
};

const CATALOG = catalogJson as RwaCatalogEntry[];

const DIA_BASE = "/dia-api/v1/rwa";
const YAHOO_BASE = "/yahoo-api/v8/finance/chart";

/** Same path map as scripts/price-updater.mjs */
const DIA_PATH: Record<RwaAssetType, (symbol: string) => string> = {
	Stock: (s) => `Equities/${s}`,
	ETF: (s) => `ETF/${s}`,
	Commodity: (s) => `Commodities/${s}-USD`,
	FX: (s) => `Fiat/${s}-USD`,
};

/** Yahoo tickers for chart history (DIA RWA REST is spot-only). */
const YAHOO_ALIAS: Record<string, string> = {
	GOOGL: "GOOG",
	XAU: "GC=F",
	XAGG: "SI=F",
	WTI: "CL=F",
	XBR: "BZ=F",
	NG: "NG=F",
	XG: "HG=F",
	DGC: "GC=F",
	DSC: "SI=F",
	EUR: "EURUSD=X",
	JPY: "JPYUSD=X",
	GBP: "GBPUSD=X",
	CHF: "CHFUSD=X",
	CAD: "CADUSD=X",
	AUD: "AUDUSD=X",
	CNY: "CNYUSD=X",
	BRL: "BRLUSD=X",
	NGN: "NGNUSD=X",
};

const PERIOD_YAHOO: Record<
	HistoryPeriod,
	{ range: string; interval: string }
> = {
	"1H": { range: "1d", interval: "5m" },
	"1D": { range: "1d", interval: "5m" },
	"1W": { range: "5d", interval: "1h" },
	"1M": { range: "1mo", interval: "1d" },
	"1Y": { range: "1y", interval: "1d" },
	ALL: { range: "5y", interval: "1wk" },
};

/** Shorter daily periods reuse a single 1y Yahoo pull to cut request volume. */
const PERIOD_FROM_YEAR: Partial<
	Record<HistoryPeriod, { maxAgeSec: number }>
> = {
	"1M": { maxAgeSec: 31 * 24 * 60 * 60 },
	"1W": { maxAgeSec: 7 * 24 * 60 * 60 },
};

const feedCache = new Map<string, { info: DiaFeedInfo; at: number }>();
const SPOT_TTL_MS = 60_000;

type YahooPoint = { timestamp: number; price: number };
const YAHOO_TTL_MS = 30 * 60_000;
const YAHOO_429_COOLDOWN_MS = 90_000;
const YAHOO_NETWORK_COOLDOWN_MS = 120_000;
const YAHOO_MIN_GAP_MS = 500;
const yahooSeriesCache = new Map<
	string,
	{ points: YahooPoint[]; at: number }
>();
const yahooInflight = new Map<string, Promise<YahooPoint[]>>();
const historyCache = new Map<
	string,
	{ response: AssetHistoryResponse; at: number }
>();
const historyInflight = new Map<string, Promise<AssetHistoryResponse>>();
const HISTORY_TTL_MS = 5 * 60_000;

let yahooCooldownUntil = 0;
let yahooChain: Promise<unknown> = Promise.resolve();
let lastYahooFetchAt = 0;

function yahooKey(yahooSymbol: string, range: string, interval: string) {
	return `${yahooSymbol}:${range}:${interval}`;
}

function markYahooUnavailable(ms: number) {
	yahooCooldownUntil = Math.max(yahooCooldownUntil, Date.now() + ms);
}

function yahooIsCoolingDown() {
	return Date.now() < yahooCooldownUntil;
}

function sliceSeries(
	points: YahooPoint[],
	maxAgeSec: number,
): YahooPoint[] {
	if (!points.length) return points;
	const end = points.at(-1)?.timestamp ?? 0;
	const start = end - maxAgeSec;
	const sliced = points.filter((point) => point.timestamp >= start);
	return sliced.length >= 2 ? sliced : points.slice(-Math.min(points.length, 8));
}

async function runYahooQueued<T>(task: () => Promise<T>): Promise<T> {
	const run = yahooChain.then(async () => {
		const gap = Math.max(0, lastYahooFetchAt + YAHOO_MIN_GAP_MS - Date.now());
		if (gap > 0) await new Promise((resolve) => setTimeout(resolve, gap));
		if (yahooIsCoolingDown()) {
			throw new Error("Yahoo unavailable");
		}
		try {
			return await task();
		} finally {
			lastYahooFetchAt = Date.now();
		}
	});
	yahooChain = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}

export function symbolFromAssetId(assetId: string): string {
	const raw = (assetId.split(":").at(-1) ?? assetId).toUpperCase();
	return raw === "GOOGL" ? "GOOG" : raw;
}

export function lookupRwaAsset(
	symbolOrAssetId: string,
): RwaCatalogEntry | undefined {
	const symbol = symbolFromAssetId(symbolOrAssetId);
	return CATALOG.find((item) => item.symbol.toUpperCase() === symbol);
}

export function diaFeedKey(symbol: string): string {
	return `${symbolFromAssetId(symbol)}/USD`;
}

type DiaQuote = {
	Ticker?: string;
	Name?: string;
	Price: number;
	Timestamp?: string;
};

export function formatDiaUpdatedAt(timestamp: number, now = Date.now()): string {
	const ageSec = Math.max(0, Math.floor(now / 1000) - timestamp);
	if (ageSec < 45) return "just now";
	if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
	if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`;
	return `${Math.floor(ageSec / 86400)}d ago`;
}

export function formatDiaClock(timestamp: number): string {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZoneName: "short",
	}).format(new Date(timestamp * 1000));
}

/** Age in seconds; useful for stale-feed styling. */
export function diaFeedAgeSec(timestamp: number, now = Date.now()): number {
	return Math.max(0, Math.floor(now / 1000) - timestamp);
}

export async function fetchDiaFeedInfo(
	symbolOrAssetId: string,
	options?: { refresh?: boolean },
): Promise<DiaFeedInfo | undefined> {
	const entry = lookupRwaAsset(symbolOrAssetId);
	const symbol = symbolFromAssetId(symbolOrAssetId);
	if (!entry) return undefined;

	const cached = feedCache.get(symbol);
	if (!options?.refresh && cached && Date.now() - cached.at < SPOT_TTL_MS) {
		return cached.info;
	}

	const endpoint = DIA_PATH[entry.type](entry.symbol);
	const restPath = `${DIA_BASE}/${endpoint}`;
	const res = await fetch(restPath, { signal: AbortSignal.timeout(12_000) });
	if (!res.ok) throw new Error(`DIA ${entry.symbol} HTTP ${res.status}`);
	const body = (await res.json()) as DiaQuote;
	if (!Number.isFinite(body.Price) || body.Price <= 0) {
		throw new Error(`DIA ${entry.symbol} bad price`);
	}
	const updatedAtIso = body.Timestamp ?? new Date().toISOString();
	const parsed = Math.floor(new Date(updatedAtIso).getTime() / 1000);
	const info: DiaFeedInfo = {
		symbol,
		ticker: (body.Ticker ?? entry.symbol).toUpperCase(),
		name: body.Name?.trim() || entry.name,
		type: entry.type,
		price: body.Price,
		timestamp: Number.isFinite(parsed) ? parsed : Math.floor(Date.now() / 1000),
		updatedAtIso,
		feedKey: diaFeedKey(symbol),
		restPath,
		endpoint,
		source: "dia-rwa",
	};
	feedCache.set(symbol, { info, at: Date.now() });
	return info;
}

export async function fetchDiaSpot(
	symbolOrAssetId: string,
	options?: { refresh?: boolean },
): Promise<{ price: number; timestamp: number; symbol: string } | undefined> {
	const info = await fetchDiaFeedInfo(symbolOrAssetId, options);
	if (!info) return undefined;
	return {
		price: info.price,
		timestamp: info.timestamp,
		symbol: info.symbol,
	};
}

type YahooChartResponse = {
	chart?: {
		result?: Array<{
			timestamp?: number[];
			indicators?: { quote?: Array<{ close?: Array<number | null> }> };
		}>;
		error?: { description?: string } | null;
	};
};

async function fetchYahooSeriesRaw(
	yahooSymbol: string,
	range: string,
	interval: string,
): Promise<YahooPoint[]> {
	const cacheKey = yahooKey(yahooSymbol, range, interval);
	const cached = yahooSeriesCache.get(cacheKey);
	if (cached && Date.now() - cached.at < YAHOO_TTL_MS) {
		return cached.points;
	}
	if (yahooIsCoolingDown()) {
		throw new Error("Yahoo unavailable");
	}

	const inflight = yahooInflight.get(cacheKey);
	if (inflight) return inflight;

	const request = runYahooQueued(async () => {
		const stillCached = yahooSeriesCache.get(cacheKey);
		if (stillCached && Date.now() - stillCached.at < YAHOO_TTL_MS) {
			return stillCached.points;
		}
		if (yahooIsCoolingDown()) {
			throw new Error("Yahoo unavailable");
		}

		const url = `${YAHOO_BASE}/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=${interval}&includePrePost=false`;
		let res: Response;
		try {
			res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
		} catch {
			markYahooUnavailable(YAHOO_NETWORK_COOLDOWN_MS);
			throw new Error(`Yahoo ${yahooSymbol} network error`);
		}
		if (res.status === 429 || res.status === 503 || res.status === 502) {
			markYahooUnavailable(
				res.status === 429 ? YAHOO_429_COOLDOWN_MS : YAHOO_NETWORK_COOLDOWN_MS,
			);
			throw new Error(`Yahoo ${yahooSymbol} HTTP ${res.status}`);
		}
		if (!res.ok) throw new Error(`Yahoo ${yahooSymbol} HTTP ${res.status}`);
		const body = (await res.json()) as YahooChartResponse;
		if (body.chart?.error) {
			throw new Error(body.chart.error.description ?? "Yahoo chart error");
		}
		const result = body.chart?.result?.[0];
		const times = result?.timestamp ?? [];
		const closes = result?.indicators?.quote?.[0]?.close ?? [];
		const points: YahooPoint[] = [];
		for (let i = 0; i < times.length; i += 1) {
			const price = closes[i];
			const ts = times[i];
			if (
				typeof price === "number" &&
				Number.isFinite(price) &&
				price > 0 &&
				ts
			) {
				points.push({ timestamp: ts, price });
			}
		}
		yahooSeriesCache.set(cacheKey, { points, at: Date.now() });
		return points;
	}).finally(() => {
		yahooInflight.delete(cacheKey);
	});

	yahooInflight.set(cacheKey, request);
	return request;
}

async function fetchYahooSeries(
	symbol: string,
	period: HistoryPeriod,
): Promise<YahooPoint[]> {
	const yahooSymbol = YAHOO_ALIAS[symbol] ?? symbol;
	const fromYear = PERIOD_FROM_YEAR[period];
	// One Yahoo pull per symbol when possible — do not fall through to a second
	// range after TLS/network failure (that just doubles proxy errors).
	if (fromYear) {
		const yearPoints = await fetchYahooSeriesRaw(yahooSymbol, "1y", "1d");
		return sliceSeries(yearPoints, fromYear.maxAgeSec);
	}

	const periodCfg = PERIOD_YAHOO[period] ?? PERIOD_YAHOO["1M"];
	return fetchYahooSeriesRaw(yahooSymbol, periodCfg.range, periodCfg.interval);
}

/** Scale market history so the last point matches the live DIA oracle price. */
function anchorToDia(
	points: YahooPoint[],
	diaPrice: number,
	diaTs: number,
): YahooPoint[] {
	if (!points.length) {
		return [{ timestamp: diaTs, price: diaPrice }];
	}
	const last = points.at(-1);
	if (!last || last.price <= 0) {
		return [{ timestamp: diaTs, price: diaPrice }];
	}
	const scale = diaPrice / last.price;
	const scaled = points.map((point) => ({
		timestamp: point.timestamp,
		price: Number((point.price * scale).toFixed(6)),
	}));
	const tip = scaled.at(-1);
	if (!tip || tip.timestamp < diaTs) {
		scaled.push({ timestamp: diaTs, price: diaPrice });
	} else {
		scaled[scaled.length - 1] = { timestamp: tip.timestamp, price: diaPrice };
	}
	return scaled;
}

function syntheticAroundSpot(
	diaPrice: number,
	diaTs: number,
	period: HistoryPeriod,
): YahooPoint[] {
	const span =
		period === "1H"
			? 60 * 60
			: period === "1D"
				? 24 * 60 * 60
				: period === "1W"
					? 7 * 24 * 60 * 60
					: period === "1M"
						? 30 * 24 * 60 * 60
						: period === "1Y"
							? 365 * 24 * 60 * 60
							: 2 * 365 * 24 * 60 * 60;
	const steps = period === "1H" || period === "1D" ? 48 : 36;
	const points: YahooPoint[] = [];
	for (let i = 0; i < steps; i += 1) {
		const t = diaTs - Math.floor((span * (steps - 1 - i)) / (steps - 1));
		const wobble = Math.sin(i / 4) * 0.012 + Math.cos(i / 7) * 0.006;
		points.push({
			timestamp: t,
			price: Number((diaPrice * (1 + wobble)).toFixed(6)),
		});
	}
	points[points.length - 1] = { timestamp: diaTs, price: diaPrice };
	return points;
}

/**
 * Chart series for swipe cards: live level from DIA RWA REST,
 * path from market history (Yahoo) rescaled to the DIA spot.
 */
export async function fetchDiaAssetHistory(
	assetId: string,
	period: HistoryPeriod = "1M",
	refresh = false,
): Promise<AssetHistoryResponse> {
	const historyKey = `${symbolFromAssetId(assetId)}:${period}`;
	if (refresh) {
		historyCache.delete(historyKey);
		historyInflight.delete(historyKey);
	} else {
		const cached = historyCache.get(historyKey);
		if (cached && Date.now() - cached.at < HISTORY_TTL_MS) {
			return cached.response;
		}
		const inflight = historyInflight.get(historyKey);
		if (inflight) return inflight;
	}

	const request = (async (): Promise<AssetHistoryResponse> => {
		const entry = lookupRwaAsset(assetId);
		const symbol = symbolFromAssetId(assetId);
		if (!entry) {
			return {
				period,
				source: "unavailable",
				points: [],
				requestedPeriod: period,
			};
		}

		try {
			const spot = await fetchDiaSpot(symbol, { refresh });
			if (!spot) {
				return {
					period,
					source: "unavailable",
					points: [],
					requestedPeriod: period,
				};
			}

			let points: YahooPoint[];
			try {
				const series = await fetchYahooSeries(symbol, period);
				points = anchorToDia(series, spot.price, spot.timestamp);
			} catch {
				points = syntheticAroundSpot(spot.price, spot.timestamp, period);
			}

			const response: AssetHistoryResponse = {
				period,
				source: "dia",
				points,
				requestedPeriod: period,
				effectivePeriod: period,
				coverageStart: points[0]?.timestamp,
				coverageEnd: points.at(-1)?.timestamp,
				sourceAsset: symbol,
				isCompleteHistory: true,
			};
			historyCache.set(historyKey, { response, at: Date.now() });
			return response;
		} catch {
			return {
				period,
				source: "unavailable",
				points: [],
				requestedPeriod: period,
			};
		}
	})().finally(() => {
		historyInflight.delete(historyKey);
	});

	historyInflight.set(historyKey, request);
	return request;
}

export async function enrichCandidatesWithDiaPrices<
	T extends { symbol: string; marketPriceUsd?: number },
>(candidates: T[]): Promise<T[]> {
	const unique = [
		...new Set(candidates.map((c) => symbolFromAssetId(c.symbol))),
	];
	const prices = new Map<string, number>();
	await Promise.all(
		unique.map(async (symbol) => {
			try {
				const spot = await fetchDiaSpot(symbol);
				if (!spot) return;
				prices.set(spot.symbol, spot.price);
				prices.set(symbol, spot.price);
				// Fixture registry still uses GOOGL while DIA/catalog use GOOG.
				if (spot.symbol === "GOOG") prices.set("GOOGL", spot.price);
			} catch {
				/* keep fixture price */
			}
		}),
	);
	return candidates.map((candidate) => {
		const key = candidate.symbol.toUpperCase();
		const live =
			prices.get(key) ?? prices.get(symbolFromAssetId(candidate.symbol));
		return live !== undefined
			? { ...candidate, marketPriceUsd: live }
			: candidate;
	});
}

/** DIA REST path for a catalog symbol — shared with on-chain updater. */
export function diaRestPath(symbolOrAssetId: string): string | undefined {
	const entry = lookupRwaAsset(symbolOrAssetId);
	if (!entry) return undefined;
	return `${DIA_BASE}/${DIA_PATH[entry.type](entry.symbol)}`;
}
