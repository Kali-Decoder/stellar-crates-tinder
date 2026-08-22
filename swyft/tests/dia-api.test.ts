import { describe, expect, it } from "vitest";
import {
	diaFeedKey,
	lookupRwaAsset,
	symbolFromAssetId,
} from "../src/client/stellar/dia-api.js";

describe("DIA RWA helpers", () => {
	it("normalizes GOOGL to GOOG for catalog and feed keys", () => {
		expect(symbolFromAssetId("rh:4663:GOOGL")).toBe("GOOG");
		expect(symbolFromAssetId("AAPL")).toBe("AAPL");
		expect(diaFeedKey("GOOGL")).toBe("GOOG/USD");
	});

	it("resolves catalog entries used by the vault swipe deck", () => {
		expect(lookupRwaAsset("AAPL")?.type).toBe("Stock");
		expect(lookupRwaAsset("SPY")?.type).toBe("ETF");
		expect(lookupRwaAsset("XAU")?.type).toBe("Commodity");
		expect(lookupRwaAsset("EUR")?.type).toBe("FX");
		expect(lookupRwaAsset("GOOGL")?.symbol).toBe("GOOG");
		expect(lookupRwaAsset("NOTREAL")).toBeUndefined();
	});
});
