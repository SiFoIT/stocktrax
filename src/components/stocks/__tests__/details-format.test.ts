import { describe, it, expect } from "vitest";
import { formatLargeAmount, formatPerShare, formatQuoteChange, formatQuotePrice } from "../details-format";

// Tests pin en-US output; they run under Node's default locale.
const n = (s: string) => s.replace(/ /g, " ");

describe("formatQuotePrice", () => {
  it("keeps sub-cent prices from rounding to 0.01", () => {
    expect(formatQuotePrice(0.0093, { symbol: "XYZ-USD", currency: "USD" })).toBe("$0.009300");
  });

  it("shows ordinary stock prices at two decimals in their currency", () => {
    expect(formatQuotePrice(187.5, { symbol: "AAPL", currency: "USD" })).toBe("$187.50");
    expect(n(formatQuotePrice(42.1, { symbol: "RY.TO", currency: "CAD" }))).toBe("CA$42.10");
  });

  it("does not put a currency symbol on index levels or FX rates", () => {
    expect(formatQuotePrice(6012.34, { symbol: "^GSPC", currency: "USD", quoteType: "INDEX" })).toBe("6,012.34");
    expect(formatQuotePrice(1.38061, { symbol: "USDCAD=X", currency: "CAD" })).toBe("1.381");
  });

  it("shows pence for GBp", () => {
    expect(formatQuotePrice(1234.5, { symbol: "VOD.L", currency: "GBp" })).toBe("1,234.50p");
  });

  it("is a dash without a value", () => {
    expect(formatQuotePrice(undefined, { symbol: "AAPL" })).toBe("-");
  });
});

describe("formatQuoteChange", () => {
  it("keeps a small FX change visible", () => {
    expect(formatQuoteChange(0.0042, { symbol: "USDCAD=X", price: 1.38 })).toBe("+0.004");
    expect(formatQuoteChange(0.000042, { symbol: "JPYCAD=X", price: 0.008985 })).toBe("+0.000042");
  });

  it("signs both directions and never prints -0", () => {
    expect(formatQuoteChange(-1.234, { symbol: "AAPL", price: 187 })).toBe("-1.23");
    expect(formatQuoteChange(-0.001, { symbol: "AAPL", price: 187 })).toBe("+0.00");
  });
});

describe("formatLargeAmount", () => {
  it("handles negatives", () => {
    expect(formatLargeAmount(-5_000_000_000, "USD")).toBe("-$5.00B");
    expect(formatLargeAmount(2.5e12, "USD")).toBe("$2.50T");
  });

  it("uses the quote's currency", () => {
    expect(n(formatLargeAmount(5e9, "CAD"))).toBe("CA$5.00B");
  });
});

describe("formatPerShare", () => {
  it("keeps two decimals in the quote's currency", () => {
    expect(formatPerShare(-0.05, "USD")).toBe("-$0.05");
  });
});
