import { z } from "zod";
import {
	appendActivity,
	listActivityForWallet,
	toPublicActivity,
} from "./activity.js";
import { computeBasketPnl } from "./pnl.js";
import { ActivityModel, BasketModel, type BasketDoc } from "./models.js";
import { isMongoReady } from "./mongo.js";

const allocationInput = z.object({
	symbol: z.string().min(1).max(16),
	asset: z.string().min(1),
	diaKey: z.string().min(1),
	targetBps: z.number().int().min(1).max(10_000),
	priceAtDepositUsd: z.number().positive(),
});

const createBasketBody = z.object({
	ownerWallet: z.string().regex(/^G[A-Z0-9]{55}$/),
	bucketId: z.number().int().nonnegative(),
	vaultAddress: z.string().min(1),
	name: z.string().min(1).max(120),
	allocations: z.array(allocationInput).min(1),
	depositUsd: z.number().positive(),
	shares: z.string().min(1),
	createTxHash: z.string().optional().default(""),
	approveTxHash: z.string().optional().default(""),
	depositTxHash: z.string().optional().default(""),
	notes: z.string().optional().default(""),
	tags: z.array(z.string()).optional(),
});

const ledgerBody = z.object({
	usdAmount: z.number().positive(),
	shares: z.string().min(1),
	txHash: z.string().optional().default(""),
	tags: z.array(z.string()).optional(),
});

const rebalanceBody = z.object({
	txHash: z.string().min(1),
	tags: z.array(z.string()).optional(),
	meta: z.record(z.string(), z.unknown()).optional(),
});

const activityBody = z.object({
	ownerWallet: z.string().regex(/^G[A-Z0-9]{55}$/),
	basketId: z.string().optional().default(""),
	bucketId: z.number().int().nonnegative(),
	vaultAddress: z.string().min(1),
	basketName: z.string().optional().default(""),
	kind: z.enum([
		"create",
		"approve",
		"deposit",
		"withdraw",
		"rebalance",
		"close",
	]),
	tags: z.array(z.string()).optional(),
	usdAmount: z.number().optional().default(0),
	shares: z.string().optional().default(""),
	txHash: z.string().optional().default(""),
	meta: z.record(z.string(), z.unknown()).optional(),
});

/** In-memory fallback when MONGODB_URI is unset (local mock). */
const memoryById = new Map<string, BasketDoc & { _id: { toString(): string } }>();

function toPublic(doc: BasketDoc & { _id: { toString(): string } }) {
	return {
		id: doc._id.toString(),
		ownerWallet: doc.ownerWallet,
		bucketId: doc.bucketId,
		vaultAddress: doc.vaultAddress,
		name: doc.name,
		status: doc.status,
		allocations: doc.allocations,
		costBasisUsd: doc.costBasisUsd,
		sharesOutstanding: doc.sharesOutstanding,
		createTxHash: doc.createTxHash,
		approveTxHash: doc.approveTxHash,
		depositTxHash: doc.depositTxHash,
		ledger: doc.ledger,
		notes: doc.notes,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}

async function fetchDiaSpots(symbols: string[]): Promise<Record<string, number>> {
	const out: Record<string, number> = {};
	await Promise.all(
		symbols.map(async (symbol) => {
			const upper = symbol.toUpperCase();
			const path =
				upper.length <= 5 && !["XAU", "XAGG", "WTI", "XBR", "NG", "XG"].includes(upper)
					? `Equities/${upper}`
					: ["SPY", "QQQ", "VOO", "IVV", "TLT", "GOVT", "EEM", "IBIT", "ARKB", "BITO", "GBTC", "FBTC", "ETHA", "BETH"].includes(upper)
						? `ETF/${upper}`
						: upper === "XAU" || upper === "DGC"
							? "Commodities/XAU-USD"
							: `Equities/${upper}`;
			try {
				const res = await fetch(`https://api.diadata.org/v1/rwa/${path}`, {
					signal: AbortSignal.timeout(8_000),
				});
				if (!res.ok) return;
				const json = (await res.json()) as { Price?: number };
				if (typeof json.Price === "number" && json.Price > 0) {
					out[upper] = json.Price;
				}
			} catch {
				/* keep entry price fallback in PnL */
			}
		}),
	);
	return out;
}

export type PortfolioHandlers = {
	createBasket: (raw: unknown) => Promise<{ status: number; body: unknown }>;
	listBaskets: (wallet: string, status?: string) => Promise<{ status: number; body: unknown }>;
	getBasket: (id: string) => Promise<{ status: number; body: unknown }>;
	getBasketPnl: (id: string) => Promise<{ status: number; body: unknown }>;
	walletPortfolio: (wallet: string) => Promise<{ status: number; body: unknown }>;
	recordDeposit: (id: string, raw: unknown) => Promise<{ status: number; body: unknown }>;
	recordWithdraw: (id: string, raw: unknown) => Promise<{ status: number; body: unknown }>;
	recordRebalance: (id: string, raw: unknown) => Promise<{ status: number; body: unknown }>;
	closeBasket: (id: string) => Promise<{ status: number; body: unknown }>;
	listActivity: (
		wallet: string,
		opts?: { kind?: string; limit?: number },
	) => Promise<{ status: number; body: unknown }>;
	recordActivity: (raw: unknown) => Promise<{ status: number; body: unknown }>;
};

export function createPortfolioHandlers(): PortfolioHandlers {
	return {
		async createBasket(raw) {
			const parsed = createBasketBody.safeParse(raw);
			if (!parsed.success) {
				return { status: 400, body: { error: parsed.error.flatten() } };
			}
			const bps = parsed.data.allocations.reduce((s, a) => s + a.targetBps, 0);
			if (bps !== 10_000) {
				return { status: 400, body: { error: "allocations must sum to 10000 bps" } };
			}

			const symbols = parsed.data.allocations.map((a) => a.symbol.toUpperCase());
			const doc = {
				ownerWallet: parsed.data.ownerWallet,
				bucketId: parsed.data.bucketId,
				vaultAddress: parsed.data.vaultAddress,
				name: parsed.data.name,
				status: "active" as const,
				allocations: parsed.data.allocations.map((a) => ({
					...a,
					symbol: a.symbol.toUpperCase(),
				})),
				costBasisUsd: parsed.data.depositUsd,
				sharesOutstanding: parsed.data.shares,
				createTxHash: parsed.data.createTxHash,
				approveTxHash: parsed.data.approveTxHash,
				depositTxHash: parsed.data.depositTxHash,
				notes: parsed.data.notes,
				ledger: [
					{
						kind: "deposit" as const,
						usdAmount: parsed.data.depositUsd,
						shares: parsed.data.shares,
						txHash: parsed.data.depositTxHash,
						at: new Date(),
					},
				],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			let publicBasket: ReturnType<typeof toPublic>;
			if (isMongoReady()) {
				try {
					const created = await BasketModel.create(doc);
					publicBasket = toPublic(created);
				} catch (err) {
					const message = err instanceof Error ? err.message : "create failed";
					if (message.includes("duplicate") || message.includes("E11000")) {
						return { status: 409, body: { error: "basket already recorded" } };
					}
					return { status: 500, body: { error: message } };
				}
			} else {
				const id = `mem_${parsed.data.ownerWallet.slice(0, 8)}_${parsed.data.bucketId}_${Date.now()}`;
				const stored = {
					...doc,
					_id: { toString: () => id },
				} as BasketDoc & { _id: { toString(): string } };
				memoryById.set(id, stored);
				publicBasket = toPublic(stored);
			}

			const baseTags = parsed.data.tags ?? [];
			const meta = {
				symbols,
				notes: parsed.data.notes || undefined,
			};
			await Promise.all([
				appendActivity({
					ownerWallet: publicBasket.ownerWallet,
					basketId: publicBasket.id,
					bucketId: publicBasket.bucketId,
					vaultAddress: publicBasket.vaultAddress,
					basketName: publicBasket.name,
					kind: "create",
					tags: [...baseTags, "basket", "create", "initial"],
					txHash: publicBasket.createTxHash,
					meta,
					at: publicBasket.createdAt,
				}),
				appendActivity({
					ownerWallet: publicBasket.ownerWallet,
					basketId: publicBasket.id,
					bucketId: publicBasket.bucketId,
					vaultAddress: publicBasket.vaultAddress,
					basketName: publicBasket.name,
					kind: "approve",
					tags: [...baseTags, "basket", "approve", "usdc"],
					txHash: publicBasket.approveTxHash,
					meta,
					at: publicBasket.createdAt,
				}),
				appendActivity({
					ownerWallet: publicBasket.ownerWallet,
					basketId: publicBasket.id,
					bucketId: publicBasket.bucketId,
					vaultAddress: publicBasket.vaultAddress,
					basketName: publicBasket.name,
					kind: "deposit",
					tags: [...baseTags, "basket", "deposit", "initial"],
					usdAmount: parsed.data.depositUsd,
					shares: parsed.data.shares,
					txHash: publicBasket.depositTxHash,
					meta,
					at: publicBasket.createdAt,
				}),
			]);

			return { status: 201, body: publicBasket };
		},

		async listBaskets(wallet, status) {
			if (!/^G[A-Z0-9]{55}$/.test(wallet)) {
				return { status: 400, body: { error: "invalid stellar address" } };
			}
			if (isMongoReady()) {
				const filter: Record<string, unknown> = { ownerWallet: wallet };
				if (status === "active" || status === "closed") filter.status = status;
				const rows = await BasketModel.find(filter).sort({ createdAt: -1 }).lean();
				return {
					status: 200,
					body: {
						wallet,
						baskets: rows.map((row) =>
							toPublic({
								...row,
								_id: { toString: () => String(row._id) },
							} as BasketDoc & { _id: { toString(): string } }),
						),
					},
				};
			}
			const baskets = [...memoryById.values()]
				.filter(
					(b) =>
						b.ownerWallet === wallet && (!status || b.status === status),
				)
				.sort(
					(a, b) =>
						new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
				)
				.map(toPublic);
			return { status: 200, body: { wallet, baskets } };
		},

		async getBasket(id) {
			const doc = await loadById(id);
			if (!doc) return { status: 404, body: { error: "basket not found" } };
			return { status: 200, body: toPublic(doc) };
		},

		async getBasketPnl(id) {
			const doc = await loadById(id);
			if (!doc) return { status: 404, body: { error: "basket not found" } };
			const symbols = doc.allocations.map((a) => a.symbol);
			const spots = await fetchDiaSpots(symbols);
			const pnl = computeBasketPnl(doc, spots);
			return { status: 200, body: { basket: toPublic(doc), pnl } };
		},

		async walletPortfolio(wallet) {
			const listed = await this.listBaskets(wallet, "active");
			if (listed.status !== 200) return listed;
			const body = listed.body as { baskets: ReturnType<typeof toPublic>[] };
			const summaries = [];
			let costBasisUsd = 0;
			let currentNavUsd = 0;
			for (const basket of body.baskets) {
				const symbols = basket.allocations.map((a) => a.symbol);
				const spots = await fetchDiaSpots(symbols);
				const pnl = computeBasketPnl(basket, spots);
				costBasisUsd += pnl.costBasisUsd;
				currentNavUsd += pnl.currentNavUsd;
				summaries.push({ ...basket, pnl });
			}
			return {
				status: 200,
				body: {
					wallet,
					basketCount: summaries.length,
					costBasisUsd: round2(costBasisUsd),
					currentNavUsd: round2(currentNavUsd),
					pnlUsd: round2(currentNavUsd - costBasisUsd),
					pnlPct:
						costBasisUsd > 0
							? ((currentNavUsd - costBasisUsd) / costBasisUsd) * 100
							: 0,
					baskets: summaries,
				},
			};
		},

		async recordDeposit(id, raw) {
			const parsed = ledgerBody.safeParse(raw);
			if (!parsed.success) {
				return { status: 400, body: { error: parsed.error.flatten() } };
			}
			const doc = await loadById(id);
			if (!doc) return { status: 404, body: { error: "basket not found" } };
			if (doc.status !== "active") {
				return { status: 400, body: { error: "basket is closed" } };
			}
			doc.costBasisUsd += parsed.data.usdAmount;
			doc.sharesOutstanding = addShares(
				doc.sharesOutstanding,
				parsed.data.shares,
			);
			doc.ledger.push({
				kind: "deposit",
				usdAmount: parsed.data.usdAmount,
				shares: parsed.data.shares,
				txHash: parsed.data.txHash,
				at: new Date(),
			});
			doc.updatedAt = new Date();
			await saveDoc(doc);
			const publicBasket = toPublic(doc);
			await appendActivity({
				ownerWallet: publicBasket.ownerWallet,
				basketId: publicBasket.id,
				bucketId: publicBasket.bucketId,
				vaultAddress: publicBasket.vaultAddress,
				basketName: publicBasket.name,
				kind: "deposit",
				tags: [...(parsed.data.tags ?? []), "basket", "deposit"],
				usdAmount: parsed.data.usdAmount,
				shares: parsed.data.shares,
				txHash: parsed.data.txHash,
			});
			return { status: 200, body: publicBasket };
		},

		async recordWithdraw(id, raw) {
			const parsed = ledgerBody.safeParse(raw);
			if (!parsed.success) {
				return { status: 400, body: { error: parsed.error.flatten() } };
			}
			const doc = await loadById(id);
			if (!doc) return { status: 404, body: { error: "basket not found" } };
			doc.costBasisUsd = Math.max(0, doc.costBasisUsd - parsed.data.usdAmount);
			doc.sharesOutstanding = subShares(
				doc.sharesOutstanding,
				parsed.data.shares,
			);
			doc.ledger.push({
				kind: "withdraw",
				usdAmount: parsed.data.usdAmount,
				shares: parsed.data.shares,
				txHash: parsed.data.txHash,
				at: new Date(),
			});
			if (Number(doc.sharesOutstanding) <= 0) {
				doc.status = "closed";
				doc.sharesOutstanding = "0";
			}
			doc.updatedAt = new Date();
			await saveDoc(doc);
			const publicBasket = toPublic(doc);
			await appendActivity({
				ownerWallet: publicBasket.ownerWallet,
				basketId: publicBasket.id,
				bucketId: publicBasket.bucketId,
				vaultAddress: publicBasket.vaultAddress,
				basketName: publicBasket.name,
				kind: "withdraw",
				tags: [...(parsed.data.tags ?? []), "basket", "withdraw"],
				usdAmount: parsed.data.usdAmount,
				shares: parsed.data.shares,
				txHash: parsed.data.txHash,
			});
			if (publicBasket.status === "closed") {
				await appendActivity({
					ownerWallet: publicBasket.ownerWallet,
					basketId: publicBasket.id,
					bucketId: publicBasket.bucketId,
					vaultAddress: publicBasket.vaultAddress,
					basketName: publicBasket.name,
					kind: "close",
					tags: ["basket", "close", "auto"],
					txHash: parsed.data.txHash
						? `${parsed.data.txHash}:close`
						: `close:${publicBasket.id}`,
					meta: { reason: "shares_depleted" },
				});
			}
			return { status: 200, body: publicBasket };
		},

		async recordRebalance(id, raw) {
			const parsed = rebalanceBody.safeParse(raw);
			if (!parsed.success) {
				return { status: 400, body: { error: parsed.error.flatten() } };
			}
			const doc = await loadById(id);
			if (!doc) return { status: 404, body: { error: "basket not found" } };
			if (doc.status !== "active") {
				return { status: 400, body: { error: "basket is closed" } };
			}
			doc.updatedAt = new Date();
			await saveDoc(doc);
			const publicBasket = toPublic(doc);
			const event = await appendActivity({
				ownerWallet: publicBasket.ownerWallet,
				basketId: publicBasket.id,
				bucketId: publicBasket.bucketId,
				vaultAddress: publicBasket.vaultAddress,
				basketName: publicBasket.name,
				kind: "rebalance",
				tags: [...(parsed.data.tags ?? []), "basket", "rebalance"],
				txHash: parsed.data.txHash,
				meta: parsed.data.meta,
			});
			return { status: 200, body: { basket: publicBasket, activity: event } };
		},

		async closeBasket(id) {
			const doc = await loadById(id);
			if (!doc) return { status: 404, body: { error: "basket not found" } };
			doc.status = "closed";
			doc.updatedAt = new Date();
			await saveDoc(doc);
			const publicBasket = toPublic(doc);
			await appendActivity({
				ownerWallet: publicBasket.ownerWallet,
				basketId: publicBasket.id,
				bucketId: publicBasket.bucketId,
				vaultAddress: publicBasket.vaultAddress,
				basketName: publicBasket.name,
				kind: "close",
				tags: ["basket", "close"],
			});
			return { status: 200, body: publicBasket };
		},

		async listActivity(wallet, opts) {
			if (!/^G[A-Z0-9]{55}$/.test(wallet)) {
				return { status: 400, body: { error: "invalid stellar address" } };
			}
			let events = await listActivityForWallet(wallet, opts);
			if (events.length === 0) {
				events = await backfillFromBaskets(wallet);
			}
			return {
				status: 200,
				body: {
					wallet,
					count: events.length,
					events,
				},
			};
		},

		async recordActivity(raw) {
			const parsed = activityBody.safeParse(raw);
			if (!parsed.success) {
				return { status: 400, body: { error: parsed.error.flatten() } };
			}
			const event = await appendActivity(parsed.data);
			return { status: 201, body: event };
		},
	};
}

async function backfillFromBaskets(wallet: string) {
	const listed = await createPortfolioHandlers().listBaskets(wallet);
	if (listed.status !== 200) return [];
	const body = listed.body as { baskets: ReturnType<typeof toPublic>[] };
	const synthesized: ReturnType<typeof toPublicActivity>[] = [];

	for (const basket of body.baskets) {
		const symbols = basket.allocations.map((a) => a.symbol);
		const meta = { symbols, backfill: true };
		if (basket.createTxHash) {
			synthesized.push(
				await appendActivity({
					ownerWallet: wallet,
					basketId: basket.id,
					bucketId: basket.bucketId,
					vaultAddress: basket.vaultAddress,
					basketName: basket.name,
					kind: "create",
					tags: ["basket", "create", "backfill"],
					txHash: basket.createTxHash,
					meta,
					at: new Date(basket.createdAt),
				}),
			);
		}
		if (basket.approveTxHash) {
			synthesized.push(
				await appendActivity({
					ownerWallet: wallet,
					basketId: basket.id,
					bucketId: basket.bucketId,
					vaultAddress: basket.vaultAddress,
					basketName: basket.name,
					kind: "approve",
					tags: ["basket", "approve", "usdc", "backfill"],
					txHash: basket.approveTxHash,
					meta,
					at: new Date(basket.createdAt),
				}),
			);
		}
		for (const entry of basket.ledger ?? []) {
			synthesized.push(
				await appendActivity({
					ownerWallet: wallet,
					basketId: basket.id,
					bucketId: basket.bucketId,
					vaultAddress: basket.vaultAddress,
					basketName: basket.name,
					kind: entry.kind,
					tags: [
						"basket",
						entry.kind,
						entry.kind === "deposit" && entry.txHash === basket.depositTxHash
							? "initial"
							: "backfill",
					].filter(Boolean) as string[],
					usdAmount: entry.usdAmount,
					shares: entry.shares,
					txHash: entry.txHash,
					meta,
					at: new Date(entry.at),
				}),
			);
		}
		if (basket.status === "closed") {
			synthesized.push(
				await appendActivity({
					ownerWallet: wallet,
					basketId: basket.id,
					bucketId: basket.bucketId,
					vaultAddress: basket.vaultAddress,
					basketName: basket.name,
					kind: "close",
					tags: ["basket", "close", "backfill"],
					txHash: `close:${basket.id}`,
					at: new Date(basket.updatedAt),
				}),
			);
		}
	}

	return synthesized.sort(
		(a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
	);
}

async function loadById(id: string) {
	if (isMongoReady()) {
		return BasketModel.findById(id);
	}
	return memoryById.get(id) ?? null;
}

async function saveDoc(doc: BasketDoc & { _id: { toString(): string } }) {
	if (isMongoReady()) {
		await BasketModel.findByIdAndUpdate(doc._id, doc);
		return;
	}
	memoryById.set(doc._id.toString(), doc);
}

function addShares(a: string, b: string) {
	return (BigInt(a) + BigInt(b)).toString();
}

function subShares(a: string, b: string) {
	const next = BigInt(a) - BigInt(b);
	return (next < 0n ? 0n : next).toString();
}

function round2(n: number) {
	return Math.round(n * 100) / 100;
}

/** Used by health / tests — ensure model is referenced when Mongo is up. */
export function activityModelReady() {
	return Boolean(ActivityModel);
}
