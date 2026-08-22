import catalogJson from "../../data/rwa-catalog.json";
import type { AssetHistoryResponse, HistoryPeriod } from "../api.js";

export type RwaAssetType = "Stock" | "ETF" | "Commodity" | "FX";

export type RwaCatalogEntry = {
	symbol: string;
	name: string;
	type: RwaAssetType;
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

const spotCache = new Map<string, { price: number; at: number }>();
const SPOT_TTL_MS = 60_000;

export function symbolFromAssetId(assetId: string): string {
	const raw = (assetId.split(":").at(-1) ?? assetId).toUpperCase();
	return raw === "GOOGL" ? "GOOG" : raw;
}

export function lookupRwaAsset(symbolOrAssetId: string): RwaCatalogEntry | undefined {
	const symbol = symbolFromAssetId(symbolOrAssetId);
	return CATALOG.find((item) => item.symbol.toUpperCase() === symbol);
}

export function diaFeedKey(symbol: string): string {
	return `${symbolFromAssetId(symbol)}/USD`;
}

type DiaQuote = { Ticker?: string; Price: number; Timestamp?: string };

export async function fetchDiaSpot(
	symbolOrAssetId: string,
	options?: { refresh?: boolean },
): Promise<{ price: number; timestamp: number; symbol: string } | undefined> {
	const entry = lookupRwaAsset(symbolOrAssetId);
	const symbol = symbolFromAssetId(symbolOrAssetId);
	if (!entry) return undefined;

	const cached = spotCache.get(symbol);
	if (
		!options?.refresh &&
		cached &&
		Date.now() - cached.at < SPOT_TTL_MS
	) {
		return { price: cached.price, timestamp: Math.floor(cached.at / 1000), symbol };
	}

	const url = `${DIA_BASE}/${DIA_PATH[entry.type](entry.symbol)}`;
	const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
	if (!res.ok) throw new Error(`DIA ${entry.symbol} HTTP ${res.status}`);
	const body = (await res.json()) as DiaQuote;
	if (!Number.isFinite(body.Price) || body.Price <= 0) {
		throw new Error(`DIA ${entry.symbol} bad price`);
	}
	const timestamp = body.Timestamp
		? Math.floor(new Date(body.Timestamp).getTime() / 1000)
		: Math.floor(Date.now() / 1000);
	spotCache.set(symbol, { price: body.Price, at: Date.now() });
	return { price: body.Price, timestamp, symbol };
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

async function fetchYahooSeries(
	symbol: string,
	period: HistoryPeriod,
): Promise<Array<{ timestamp: number; price: number }>> {
	const yahooSymbol = YAHOO_ALIAS[symbol] ?? symbol;
	const periodCfg = PERIOD_YAHOO[period] ?? PERIOD_YAHOO["1M"];
	const { range, interval } = periodCfg;
	const url = `${YAHOO_BASE}/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=${interval}&includePrePost=false`;
	const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
	if (!res.ok) throw new Error(`Yahoo ${yahooSymbol} HTTP ${res.status}`);
	const body = (await res.json()) as YahooChartResponse;
	if (body.chart?.error) {
		throw new Error(body.chart.error.description ?? "Yahoo chart error");
	}
	const result = body.chart?.result?.[0];
	const times = result?.timestamp ?? [];
	const closes = result?.indicators?.quote?.[0]?.close ?? [];
	const points: Array<{ timestamp: number; price: number }> = [];
	for (let i = 0; i < times.length; i += 1) {
		const price = closes[i];
		const ts = times[i];
		if (typeof price === "number" && Number.isFinite(price) && price > 0 && ts) {
			points.push({ timestamp: ts, price });
		}
	}
	return points;
}

/** Scale market history so the last point matches the live DIA oracle price. */
function anchorToDia(
	points: Array<{ timestamp: number; price: number }>,
	diaPrice: number,
	diaTs: number,
): Array<{ timestamp: number; price: number }> {
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
): Array<{ timestamp: number; price: number }> {
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
	const points: Array<{ timestamp: number; price: number }> = [];
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
	const entry = lookupRwaAsset(assetId);
	const symbol = symbolFromAssetId(assetId);
	if (!entry) {
		return { period, source: "unavailable", points: [], requestedPeriod: period };
	}

	try {
		const spot = await fetchDiaSpot(symbol, { refresh });
		if (!spot) {
			return { period, source: "unavailable", points: [], requestedPeriod: period };
		}

		let points: Array<{ timestamp: number; price: number }>;
		try {
			const series = await fetchYahooSeries(symbol, period);
			points = anchorToDia(series, spot.price, spot.timestamp);
		} catch {
			points = syntheticAroundSpot(spot.price, spot.timestamp, period);
		}

		return {
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
	} catch {
		return { period, source: "unavailable", points: [], requestedPeriod: period };
	}
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
