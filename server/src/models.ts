import mongoose, { Schema, model, type InferSchemaType, type Model } from "mongoose";

const allocationSchema = new Schema(
	{
		symbol: { type: String, required: true },
		asset: { type: String, required: true },
		diaKey: { type: String, required: true },
		targetBps: { type: Number, required: true, min: 1, max: 10_000 },
		/** Spot USD at deposit time — used for mark-to-market PnL before rebalance. */
		priceAtDepositUsd: { type: Number, required: true, min: 0 },
	},
	{ _id: false },
);

const ledgerSchema = new Schema(
	{
		kind: { type: String, enum: ["deposit", "withdraw"], required: true },
		usdAmount: { type: Number, required: true },
		shares: { type: String, required: true },
		txHash: { type: String, default: "" },
		at: { type: Date, default: Date.now },
	},
	{ _id: false },
);

const basketSchema = new Schema(
	{
		ownerWallet: { type: String, required: true, index: true },
		/** On-chain bucket id from create_bucket (unique per vault). */
		bucketId: { type: Number, required: true, index: true },
		vaultAddress: { type: String, required: true },
		name: { type: String, required: true },
		status: {
			type: String,
			enum: ["active", "closed"],
			default: "active",
			index: true,
		},
		allocations: { type: [allocationSchema], required: true },
		/** Net cost basis in USD (deposits − withdrawals). */
		costBasisUsd: { type: Number, required: true, min: 0 },
		sharesOutstanding: { type: String, required: true },
		createTxHash: { type: String, default: "" },
		approveTxHash: { type: String, default: "" },
		depositTxHash: { type: String, default: "" },
		ledger: { type: [ledgerSchema], default: [] },
		notes: { type: String, default: "" },
	},
	{ timestamps: true },
);

basketSchema.index({ ownerWallet: 1, bucketId: 1 }, { unique: true });
basketSchema.index({ ownerWallet: 1, status: 1, createdAt: -1 });

export type BasketDoc = InferSchemaType<typeof basketSchema> & {
	_id: { toString(): string };
	createdAt: Date;
	updatedAt: Date;
};

export const BasketModel: Model<BasketDoc> =
	(mongoose.models.StellarBasket as Model<BasketDoc> | undefined) ??
	model<BasketDoc>("StellarBasket", basketSchema);
