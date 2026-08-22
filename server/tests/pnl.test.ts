import { describe, expect, it } from "vitest";
import { computeBasketPnl } from "../src/pnl.js";

describe("computeBasketPnl", () => {
	it("marks single-owner basket by target weights and spot change", () => {
		const pnl = computeBasketPnl(
			{
				costBasisUsd: 1000,
				allocations: [
					{
						symbol: "AAPL",
						asset: "C…",
						diaKey: "AAPL/USD",
						targetBps: 5000,
						priceAtDepositUsd: 200,
					},
					{
						symbol: "NVDA",
						asset: "C…",
						diaKey: "NVDA/USD",
						targetBps: 5000,
						priceAtDepositUsd: 100,
					},
				],
			},
			{ AAPL: 240, NVDA: 120 },
		);

		// each sleeve $500 → AAPL 500*1.2=600, NVDA 500*1.2=600
		expect(pnl.currentNavUsd).toBe(1200);
		expect(pnl.pnlUsd).toBe(200);
		expect(pnl.pnlPct).toBeCloseTo(20);
	});
});
