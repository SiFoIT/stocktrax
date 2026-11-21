import { describe, it, expect } from "vitest";
import { MarketData, ProxyQuote } from "@/types";
import {
  formatMarketChange,
  formatMarketPrice,
  proxyMove,
  proxyTooltip,
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

function proxy(overrides: Partial<ProxyQuote> = {}): ProxyQuote {
  return {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF",
    extendedHours: {
      marketState: "CLOSED",
      postMarketPrice: 697.49,
      postMarketChange: 7.68,
      postMarketChangePercent: 1.11,
      postMarketTime: "2026-11-21T00:59:00Z",
    },
    ...overrides,
  };
}

function card(overrides: Partial<MarketData> = {}): MarketData {
  return {
    symbol: "^GSPC",
    name: "S&P 500",
    price: 6910.39,
    change: -265.44,
    changePercent: -3.7,
    rangeChange: -265.44,
    rangeChangePercent: -3.7,
    sparklineData: [],
    extendedHours: { marketState: "CLOSED" },
    proxy: proxy(),
    ...overrides,
  };
}

describe("proxyMove", () => {
  it("is the fund's after-hours print while the index is closed", () => {
    expect(proxyMove(card())).toMatchObject({ label: "After:", changePercent: 1.11 });
  });

  it("shows nothing during the session, when the card's own price is live", () => {
    expect(proxyMove(card({ extendedHours: { marketState: "REGULAR" } }))).toBeNull();
  });

  it("still shows when the index quote itself failed", () => {
    expect(proxyMove(card({ extendedHours: undefined }))?.label).toBe("After:");
  });

  it("is nothing for a card without a proxy, such as the TSX", () => {
    expect(proxyMove(card({ proxy: undefined }))).toBeNull();
  });
});

describe("proxyTooltip", () => {
  const move = { label: "After:", price: 697.49, change: 7.68, changePercent: 1.11, time: "2026-11-21T00:59:00Z" };

  it("leads with the fund's name, the one thing the row cannot carry", () => {
    expect(proxyTooltip(proxy(), move)).toBe("SPDR S&P 500 ETF · SPY 697.49 (+7.68) · Fri 7:59 PM ET");
  });

  it("names the Nasdaq fund for the index it actually tracks", () => {
    // The card above it says "Nasdaq", meaning the Composite; QQQ is the 100.
    const tooltip = proxyTooltip(
      proxy({ symbol: "QQQ", name: "Invesco QQQ (Nasdaq-100)" }),
      { ...move, price: 612.3, change: 9.1 }
    );
    expect(tooltip).toBe("Invesco QQQ (Nasdaq-100) · QQQ 612.30 (+9.10) · Fri 7:59 PM ET");
  });

  it("drops the timestamp Yahoo did not send rather than printing an invalid date", () => {
    expect(proxyTooltip(proxy(), { ...move, time: undefined })).toBe("SPDR S&P 500 ETF · SPY 697.49 (+7.68)");
  });
});
