import { ActivityModel, type ActivityDoc, type ActivityKind } from "./models.js";
import { isMongoReady } from "./mongo.js";

export type ActivityInput = {
	ownerWallet: string;
	basketId: string;
	bucketId: number;
	vaultAddress: string;
	basketName?: string;
	kind: ActivityKind;
	tags?: string[];
	usdAmount?: number;
	shares?: string;
	txHash?: string;
	meta?: Record<string, unknown>;
	at?: Date;
};

/** In-memory activity log when Mongo is unset. */
const memoryActivity: Array<ActivityDoc & { _id: { toString(): string } }> = [];

export function toPublicActivity(
	doc: ActivityDoc & { _id: { toString(): string } },
) {
	return {
		id: doc._id.toString(),
		ownerWallet: doc.ownerWallet,
		basketId: doc.basketId,
		bucketId: doc.bucketId,
		vaultAddress: doc.vaultAddress,
		basketName: doc.basketName ?? "",
		kind: doc.kind,
		tags: doc.tags ?? [],
		usdAmount: doc.usdAmount ?? 0,
		shares: doc.shares ?? "",
		txHash: doc.txHash ?? "",
		meta: (doc.meta as Record<string, unknown>) ?? {},
		at: doc.at,
	};
}

export async function appendActivity(input: ActivityInput) {
	const tags = normalizeTags(input.tags ?? defaultTags(input.kind));
	const doc = {
		ownerWallet: input.ownerWallet,
		basketId: input.basketId,
		bucketId: input.bucketId,
		vaultAddress: input.vaultAddress,
		basketName: input.basketName ?? "",
		kind: input.kind,
		tags,
		usdAmount: input.usdAmount ?? 0,
		shares: input.shares ?? "",
		txHash: input.txHash ?? "",
		meta: input.meta ?? {},
		at: input.at ?? new Date(),
	};

	if (isMongoReady()) {
		try {
			if (doc.txHash) {
				const existing = await ActivityModel.findOne({ txHash: doc.txHash }).lean();
				if (existing) {
					return toPublicActivity({
						...existing,
						_id: { toString: () => String(existing._id) },
					} as ActivityDoc & { _id: { toString(): string } });
				}
			}
			const created = await ActivityModel.create(doc);
			return toPublicActivity(created);
		} catch (err) {
			const message = err instanceof Error ? err.message : "activity write failed";
			if (message.includes("duplicate") || message.includes("E11000")) {
				const existing = doc.txHash
					? await ActivityModel.findOne({ txHash: doc.txHash })
					: null;
				if (existing) return toPublicActivity(existing);
			}
			throw err;
		}
	}

	if (doc.txHash) {
		const existing = memoryActivity.find((row) => row.txHash === doc.txHash);
		if (existing) return toPublicActivity(existing);
	}
	const id = `act_${input.ownerWallet.slice(0, 8)}_${input.kind}_${Date.now()}_${memoryActivity.length}`;
	const stored = { ...doc, _id: { toString: () => id } };
	memoryActivity.push(stored);
	return toPublicActivity(stored);
}

export async function listActivityForWallet(
	wallet: string,
	opts?: { kind?: string; limit?: number },
) {
	const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
	const kind =
		opts?.kind &&
		["create", "approve", "deposit", "withdraw", "rebalance", "close"].includes(
			opts.kind,
		)
			? (opts.kind as ActivityKind)
			: undefined;

	if (isMongoReady()) {
		const filter: Record<string, unknown> = { ownerWallet: wallet };
		if (kind) filter.kind = kind;
		const rows = await ActivityModel.find(filter)
			.sort({ at: -1 })
			.limit(limit)
			.lean();
		return rows.map((row) =>
			toPublicActivity({
				...row,
				_id: { toString: () => String(row._id) },
			} as ActivityDoc & { _id: { toString(): string } }),
		);
	}

	return memoryActivity
		.filter((row) => row.ownerWallet === wallet && (!kind || row.kind === kind))
		.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
		.slice(0, limit)
		.map(toPublicActivity);
}

export function defaultTags(kind: ActivityKind): string[] {
	switch (kind) {
		case "create":
			return ["basket", "create"];
		case "approve":
			return ["basket", "approve", "usdc"];
		case "deposit":
			return ["basket", "deposit"];
		case "withdraw":
			return ["basket", "withdraw"];
		case "rebalance":
			return ["basket", "rebalance"];
		case "close":
			return ["basket", "close"];
		default:
			return ["basket"];
	}
}

function normalizeTags(tags: string[]) {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of tags) {
		const tag = String(raw).trim().toLowerCase().slice(0, 32);
		if (!tag || seen.has(tag)) continue;
		seen.add(tag);
		out.push(tag);
	}
	return out.slice(0, 12);
}
