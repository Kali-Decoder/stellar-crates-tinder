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

	it("applies stable micro profit/loss when spot equals deposit", () => {
		const pnl = computeBasketPnl(
			{
				costBasisUsd: 100,
				allocations: [
					{
						symbol: "AMZN",
						targetBps: 5000,
						priceAtDepositUsd: 258.65,
					},
					{
						symbol: "AAPL",
						targetBps: 5000,
						priceAtDepositUsd: 309.42,
					},
				],
			},
			{ AMZN: 258.65, AAPL: 309.42 },
		);

		expect(pnl.marks).toHaveLength(2);
		for (const mark of pnl.marks) {
			expect(mark.priceNowUsd).not.toBe(mark.priceAtDepositUsd);
			expect(Math.abs(mark.legPnlPct)).toBeGreaterThan(0.1);
			expect(Math.abs(mark.legPnlPct)).toBeLessThan(1);
		}
		expect(pnl.pnlUsd).not.toBe(0);
		expect(pnl.note).toMatch(/demo tick/i);

		const again = computeBasketPnl(
			{
				costBasisUsd: 100,
				allocations: [
					{ symbol: "AMZN", targetBps: 5000, priceAtDepositUsd: 258.65 },
					{ symbol: "AAPL", targetBps: 5000, priceAtDepositUsd: 309.42 },
				],
			},
			{ AMZN: 258.65, AAPL: 309.42 },
		);
		expect(again.marks[0]?.priceNowUsd).toBe(pnl.marks[0]?.priceNowUsd);
		expect(again.pnlUsd).toBe(pnl.pnlUsd);
	});
});
