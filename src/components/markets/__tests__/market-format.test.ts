import { describe, it, expect } from "vitest";
import { FuturesQuote } from "@/types";
import {
  formatMarketChange,
  formatMarketPrice,
  futuresCode,
  futuresTooltip,
} from "../market-format";

/**
 * The row set is the user's to choose and currency pairs can be flipped, so
 * one fixed width per instrument type is not enough. These cases pin both
 * ends: nothing that shipped may move, and nothing newly reachable may round
 * away to zero.
 */
describe("formatMarketPrice", () => {
  it("leaves every shipped row exactly as it was", () => {
    expect(formatMarketPrice(1.38061, "USDCAD=X")).toBe("1.381");
    expect(formatMarketPrice(0.7243, "CADUSD=X")).toBe("0.724");
    expect(formatMarketPrice(153.559, "USDJPY=X")).toBe("153.559");
    expect(formatMarketPrice(16.46, "^VIX")).toBe("16.46");
    expect(formatMarketPrice(4444.7, "GC=F")).toBe("4,444.70");
    expect(formatMarketPrice(65142, "^N225")).toBe("65,142");
  });

  it("keeps four significant figures on a flipped small-unit pair", () => {
    // Three decimals would print the won as 0.001 and the yen as 0.007.
    expect(formatMarketPrice(0.001025, "KRWCAD=X")).toBe("0.001025");
    expect(formatMarketPrice(0.006512, "JPYUSD=X")).toBe("0.006512");
    expect(formatMarketPrice(0.008985, "JPYCAD=X")).toBe("0.008985");
    expect(formatMarketPrice(0.0592, "MXNUSD=X")).toBe("0.05920");
  });

  it("keeps sub-dollar tokens legible", () => {
    expect(formatMarketPrice(0.08667, "DOGE-USD")).toBe("0.0867");
    expect(formatMarketPrice(0.21312, "ADA-USD")).toBe("0.2131");
  });

  it("prints a failed quote as a price, not as a string of zeros", () => {
    expect(formatMarketPrice(0, "^FTSE")).toBe("0.00");
    expect(formatMarketPrice(0, "USDCAD=X")).toBe("0.000");
  });
});

describe("formatMarketChange", () => {
  it("takes its width from the row's price, so the columns agree", () => {
    expect(formatMarketChange(0.000002, "KRWCAD=X", 0.001025)).toBe("+0.000002");
    expect(formatMarketChange(0.00001, "JPYUSD=X", 0.006512)).toBe("+0.000010");
    expect(formatMarketChange(0.002, "USDCAD=X", 1.38061)).toBe("+0.002");
    expect(formatMarketChange(-0.302, "USDJPY=X", 153.559)).toBe("-0.302");
    expect(formatMarketChange(6.6, "GC=F", 4444.7)).toBe("+6.60");
  });

  it("signs a negative change", () => {
    expect(formatMarketChange(-4.32, "^VIX", 16.46)).toBe("-4.32");
  });

  it("drops the decimals on an index quoted in the thousands", () => {
    // The FTSE prints 10,670, so its change prints as 142, not 141.60.
    expect(formatMarketChange(-141.6, "^FTSE", 10670)).toBe("-142");
  });
});

function futures(overrides: Partial<FuturesQuote> = {}): FuturesQuote {
  return {
    symbol: "ES=F",
    name: "E-mini S&P 500",
    price: 6512.25,
    change: 27.5,
    changePercent: 0.42,
    lastTradeTime: "2026-09-10T20:12:00Z",
    ...overrides,
  };
}

describe("futuresCode", () => {
  it("drops Yahoo's contract suffix, because the card names the contract", () => {
    expect(futuresCode(futures())).toBe("ES");
    expect(futuresCode(futures({ symbol: "NQ=F" }))).toBe("NQ");
    expect(futuresCode(futures({ symbol: "YM=F" }))).toBe("YM");
  });

  it("leaves a code that does not carry the suffix alone", () => {
    expect(futuresCode(futures({ symbol: "ES" }))).toBe("ES");
  });
});

describe("futuresTooltip", () => {
  it("leads with the name, the one thing the bare code cannot carry", () => {
    expect(futuresTooltip(futures())).toBe(
      "E-mini S&P 500 · ES=F 6,512.25 (+27.50) · 4:12 PM ET"
    );
  });

  it("names the Nasdaq contract for the index it actually tracks", () => {
    // The card above it says "Nasdaq", meaning the Composite; NQ is the 100.
    const tooltip = futuresTooltip(
      futures({ symbol: "NQ=F", name: "E-mini Nasdaq-100", price: 20123.5, change: 45 })
    );
    expect(tooltip).toBe("E-mini Nasdaq-100 · NQ=F 20,124 (+45) · 4:12 PM ET");
  });

  it("drops the timestamp Yahoo did not send rather than printing an invalid date", () => {
    expect(futuresTooltip(futures({ lastTradeTime: undefined }))).toBe(
      "E-mini S&P 500 · ES=F 6,512.25 (+27.50)"
    );
  });
});
