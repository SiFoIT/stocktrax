import { describe, it, expect } from "vitest";
import {
  describeRule,
  describeScreen,
  describeSource,
  formatLastRun,
  formatThreshold,
  nextCopyName,
} from "../describe";

describe("formatThreshold", () => {
  it("keeps the number as typed, with the metric's unit", () => {
    expect(formatThreshold(20, "below_52w_high")).toBe("20%");
    expect(formatThreshold(-5, "change_5d")).toBe("-5%");
    expect(formatThreshold(2.5, "recommendation_mean")).toBe("2.5");
    expect(formatThreshold(15, "trailing_pe")).toBe("15x");
  });

  it("renders sub-billion market caps in millions", () => {
    expect(formatThreshold(10, "market_cap_billions")).toBe("$10B");
    expect(formatThreshold(0.5, "market_cap_billions")).toBe("$500M");
  });

  it("drops trailing zeros and normalises negative zero", () => {
    expect(formatThreshold(1.5, "beta")).toBe("1.5");
    expect(formatThreshold(1.0, "beta")).toBe("1");
    expect(formatThreshold(-0, "change_5d")).toBe("0%");
  });

  it("falls back to a bare number for an unknown metric", () => {
    expect(formatThreshold(7, "not_a_metric")).toBe("7");
  });
});

describe("describeRule", () => {
  it("uses a glyph for comparison operators", () => {
    expect(describeRule({ metric: "below_52w_high", operator: "gte", value: 20 })).toBe(
      "Below 52-Week High ≥ 20%"
    );
    expect(describeRule({ metric: "change_5d", operator: "lte", value: -5 })).toBe(
      "5-Day Change ≤ -5%"
    );
    expect(describeRule({ metric: "price_vs_50d_ma", operator: "gt", value: 0 })).toBe(
      "Price vs 50-Day MA > 0%"
    );
    expect(describeRule({ metric: "beta", operator: "lt", value: 1 })).toBe("Beta < 1");
  });

  it("spells out a between range", () => {
    expect(
      describeRule({ metric: "trailing_pe", operator: "between", value: 0, valueTo: 15 })
    ).toBe("Trailing P/E between 0x and 15x");
  });

  it("treats a between rule with no upper bound as a single point", () => {
    expect(describeRule({ metric: "beta", operator: "between", value: 1 })).toBe(
      "Beta between 1 and 1"
    );
  });

  it("shows the raw key when the metric is unknown", () => {
    expect(describeRule({ metric: "mystery_metric", operator: "gte", value: 3 })).toBe(
      "mystery_metric ≥ 3"
    );
  });
});

describe("describeScreen", () => {
  const rules = [
    { metric: "below_52w_high", operator: "gte" as const, value: 20 },
    { metric: "change_5d", operator: "lte" as const, value: -5 },
  ];

  it("joins with and / or according to the match mode", () => {
    expect(describeScreen(rules, "all")).toBe(
      "Below 52-Week High ≥ 20% and 5-Day Change ≤ -5%"
    );
    expect(describeScreen(rules, "any")).toBe(
      "Below 52-Week High ≥ 20% or 5-Day Change ≤ -5%"
    );
  });

  it("names the empty case", () => {
    expect(describeScreen([], "all")).toBe("No rules yet");
  });
});

describe("describeSource", () => {
  const watchlists = [{ id: 1, name: "Canadian Banks" }];
  const portfolios = [{ id: 2, name: "TFSA" }];

  it("labels each source kind", () => {
    expect(describeSource("all", watchlists, portfolios)).toBe("All symbols");
    expect(describeSource("watchlist:1", watchlists, portfolios)).toBe(
      "Watchlist: Canadian Banks"
    );
    expect(describeSource("portfolio:2", watchlists, portfolios)).toBe("Portfolio: TFSA");
  });

  it("says so when the referenced list is gone", () => {
    expect(describeSource("watchlist:99", watchlists, portfolios)).toBe("Watchlist (deleted)");
    expect(describeSource("portfolio:99", watchlists, portfolios)).toBe("Portfolio (deleted)");
  });
});

describe("formatLastRun", () => {
  const now = new Date("2026-09-09T15:00:00");

  it("names a screen that has never run", () => {
    expect(formatLastRun(null, now)).toBe("Never run");
    expect(formatLastRun(undefined, now)).toBe("Never run");
    expect(formatLastRun("not a date", now)).toBe("Never run");
  });

  it("counts minutes and hours inside a day", () => {
    expect(formatLastRun(new Date("2026-09-09T14:59:30").toISOString(), now)).toBe("Just now");
    expect(formatLastRun(new Date("2026-09-09T14:48:00").toISOString(), now)).toBe("12 min ago");
    expect(formatLastRun(new Date("2026-09-09T12:00:00").toISOString(), now)).toBe("3 h ago");
  });

  it("treats a timestamp slightly in the future as just now", () => {
    expect(formatLastRun(new Date("2026-09-09T15:00:20").toISOString(), now)).toBe("Just now");
  });

  it("switches to calendar wording past a day", () => {
    expect(formatLastRun(new Date("2026-09-08T09:00:00").toISOString(), now)).toBe("Yesterday");
    expect(formatLastRun(new Date("2026-09-02T09:00:00").toISOString(), now)).toBe("Sep 2");
    expect(formatLastRun(new Date("2025-09-02T09:00:00").toISOString(), now)).toBe("Sep 2, 2025");
  });
});

describe("nextCopyName", () => {
  it("appends copy, then numbers", () => {
    expect(nextCopyName("Value Play", [])).toBe("Value Play copy");
    expect(nextCopyName("Value Play", ["Value Play copy"])).toBe("Value Play copy 2");
    expect(nextCopyName("Value Play", ["Value Play copy", "Value Play copy 2"])).toBe(
      "Value Play copy 3"
    );
  });

  it("extends the original stem instead of nesting copies", () => {
    expect(nextCopyName("Value Play copy", ["Value Play copy"])).toBe("Value Play copy 2");
    expect(nextCopyName("Value Play copy 2", ["Value Play copy", "Value Play copy 2"])).toBe(
      "Value Play copy 3"
    );
  });
});
