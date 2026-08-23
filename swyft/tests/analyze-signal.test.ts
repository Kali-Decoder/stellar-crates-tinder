import { describe, expect, it } from "vitest";
import { analyzePriceSeries } from "../src/client/analyze-signal";

describe("analyzePriceSeries", () => {
	it("returns null without enough points", () => {
		expect(analyzePriceSeries([1, 2, 3])).toBeNull();
	});

	it("leans buy on a rising series with comments and spark", () => {
		const signal = analyzePriceSeries([100, 102, 105, 108, 112, 118]);
		expect(signal).not.toBeNull();
		expect(signal!.label).toBe("Buy");
		expect(signal!.score).toBeGreaterThanOrEqual(62);
		expect(signal!.comments.length).toBeGreaterThanOrEqual(3);
		expect(signal!.spark.length).toBeGreaterThan(2);
		expect(signal!.factors.momentum).toBeGreaterThan(50);
	});

	it("leans skip on a falling series", () => {
		const signal = analyzePriceSeries([100, 98, 95, 92, 88, 82]);
		expect(signal).not.toBeNull();
		expect(signal!.label).toBe("Skip");
		expect(signal!.score).toBeLessThanOrEqual(38);
		expect(signal!.factors.trend).toBeLessThan(50);
	});
});
