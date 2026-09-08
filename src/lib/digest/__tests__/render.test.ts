import { describe, expect, it } from "vitest";
import { digestSubject, renderHtml, renderText } from "@/lib/digest/render";
import type { DailyDigestData, WeeklyDigestData } from "@/lib/digest/types";

const WITH_DOLLARS = { showDollars: true };
const NO_DOLLARS = { showDollars: false };

const daily: DailyDigestData = {
  kind: "daily",
  dateLabel: "Mon Sep 8, 2026",
  markets: [
    { label: "S&P 500", changePercent: 0.6 },
    { label: "TSX", changePercent: 0.3 },
    { label: "Nasdaq", changePercent: 0.9 },
    { label: "CAD/USD", changePercent: -0.2, rate: 0.734 },
  ],
  portfolio: { value: 184210, change: 1340, changePercent: 0.73 },
  movers: [
    { symbol: "NVDA", name: "NVIDIA", changePercent: 4.1, changeAmount: 610 },
    { symbol: "ENB.TO", name: "Enbridge", changePercent: -1.9, changeAmount: -180 },
  ],
  watchlist: [{ symbol: "AMD", name: "Advanced Micro Devices", price: 168.4, changePercent: 3.2 }],
  watchlistThreshold: 2,
  alerts: [{ symbol: "NVDA", message: "Last price at or above 120.00" }],
  dividends: [{ symbol: "ENB.TO", amount: 84 }],
  appUrl: "https://stocktrax.example",
};

const weekly: WeeklyDigestData = {
  kind: "weekly",
  rangeLabel: "Sep 1 – 5, 2026",
  markets: [
    { label: "S&P 500", changePercent: 1.1 },
    { label: "TSX", changePercent: 0.8 },
    { label: "Nasdaq", changePercent: 1.6 },
    { label: "CAD/USD", changePercent: 0.4, rate: 0.734 },
  ],
  portfolio: { value: 184210, change: 2910, changePercent: 1.6, estimated: false },
  allTime: { amount: 22905, percent: 14.2, sinceLabel: "Mar 2021", cagr: 9.8, years: 5.5 },
  best: [{ symbol: "NVDA", name: "NVIDIA", changePercent: 7.2, changeAmount: 1050 }],
  worst: [{ symbol: "ENB.TO", name: "Enbridge", changePercent: -3, changeAmount: -290 }],
  facts: {
    fiftyTwoWeek: [{ symbol: "NVDA", kind: "high" }],
    dividends: { total: 214, symbols: ["ENB.TO", "RY.TO"], ytd: 1870 },
    nextWeekExDiv: [{ symbol: "T.TO", weekday: "Tue" }],
    activity: { buys: 2, sells: 0, netCash: 2000 },
    alerts: { count: 6, topSymbol: "NVDA", topCount: 4 },
    topHolding: { symbol: "NVDA", percent: 18 },
  },
  holdings: [
    { symbol: "NVDA", price: 124.18, weekPercent: 7.2, value: 33150, weekAmount: 1050 },
    { symbol: "ENB.TO", price: 56.4, weekPercent: -3, value: 9400, weekAmount: -290 },
  ],
  watchlists: [
    {
      name: "Tech",
      rows: [
        { symbol: "AMD", name: "AMD", price: 168.4, changePercent: 9.4, rangeNote: "near high" },
      ],
    },
  ],
  appUrl: "https://stocktrax.example",
};

describe("subjects", () => {
  it("names the period without repeating the year", () => {
    expect(digestSubject(daily)).toBe("StockTrax daily · Mon Sep 8");
    expect(digestSubject(weekly)).toBe("StockTrax weekly · Sep 1 – 5");
  });
});

describe("plain text", () => {
  it("renders the daily", () => {
    expect(renderText(daily, WITH_DOLLARS)).toMatchInlineSnapshot(`
      "StockTrax daily · Mon Sep 8, 2026

      MARKETS · TODAY
        S&P 500    +0.6%
        TSX        +0.3%
        Nasdaq     +0.9%
        CAD/USD    0.734 −0.2%

      PORTFOLIO · TODAY
        $184,210  +$1,340  +0.73%

      MOVERS
        NVDA         +4.1%  +$610
        ENB.TO       −1.9%  −$180

      WATCHLIST · MOVES OVER 2%
        AMD           $168.40   +3.2%

      ALERTS FIRED
        NVDA: Last price at or above 120.00

      DIVIDENDS
        Received $84.00 from ENB.TO

      Prices delayed 15–20 min · Values in CAD
      https://stocktrax.example"
    `);
  });

  it("renders the weekly", () => {
    const text = renderText(weekly, WITH_DOLLARS);
    expect(text).toContain("StockTrax weekly · Sep 1 – 5, 2026");
    expect(text).toContain("All time +$22,905 (+14.2%) since Mar 2021 · CAGR 9.8% per year over 5.5 yrs");
    expect(text).toContain("ALL HOLDINGS · BY WEEK CHANGE");
    expect(text).toContain("WATCHLIST · TECH");
  });
});

describe("empty sections", () => {
  const bare: DailyDigestData = {
    ...daily,
    movers: [],
    watchlist: [],
    alerts: [],
    dividends: [],
  };

  it("leaves no heading behind in HTML", () => {
    const html = renderHtml(bare, WITH_DOLLARS);
    expect(html).not.toContain("Movers");
    expect(html).not.toContain("Alerts fired");
    expect(html).not.toContain("Dividends");
    expect(html).not.toContain("Watchlist");
    // The parts that always appear are still there.
    expect(html).toContain("Markets · today");
    expect(html).toContain("Portfolio · today");
  });

  it("leaves no heading behind in text", () => {
    const text = renderText(bare, WITH_DOLLARS);
    expect(text).not.toContain("MOVERS");
    expect(text).not.toContain("ALERTS FIRED");
    expect(text).not.toContain("DIVIDENDS");
  });

  it("omits a weekly fact block that has nothing to say", () => {
    const quiet: WeeklyDigestData = {
      ...weekly,
      facts: {
        fiftyTwoWeek: [],
        dividends: null,
        nextWeekExDiv: [],
        activity: null,
        alerts: null,
        topHolding: null,
      },
    };
    const html = renderHtml(quiet, WITH_DOLLARS);
    expect(html).not.toContain("52-week");
    expect(html).not.toContain("Next week");
    expect(html).not.toContain("Top holding");
  });
});

describe("privacy switch", () => {
  // Per-share prices stay: they are public market data and say nothing about
  // how much the reader holds. What goes is every figure that reveals size.
  const SIZES = ["184,210", "1,340", "2,910", "22,905", "610", "180", "1,050", "290", "33,150", "9,400", "84.00", "214", "1,870", "2,000"];

  it("drops every portfolio figure from the daily", () => {
    for (const output of [renderHtml(daily, NO_DOLLARS), renderText(daily, NO_DOLLARS)]) {
      for (const size of SIZES) expect(output).not.toContain(size);
    }
  });

  it("drops every portfolio figure from the weekly", () => {
    for (const output of [renderHtml(weekly, NO_DOLLARS), renderText(weekly, NO_DOLLARS)]) {
      for (const size of SIZES) expect(output).not.toContain(size);
    }
  });

  it("drops the Value and Wk $ columns from the holdings table", () => {
    const html = renderHtml(weekly, NO_DOLLARS);
    expect(html).not.toContain("Wk $");
    expect(html).toContain("Price");
  });

  it("keeps the percentages", () => {
    const text = renderText(weekly, NO_DOLLARS);
    expect(text).toContain("+1.6%");
    expect(text).toContain("+14.2%");
    expect(text).toContain("+7.2%");
  });
});

describe("estimated week change", () => {
  it("marks a week priced without a stored snapshot", () => {
    const estimated: WeeklyDigestData = {
      ...weekly,
      portfolio: { ...weekly.portfolio!, estimated: true },
    };
    expect(renderText(estimated, WITH_DOLLARS)).toContain("est.");
    expect(renderHtml(estimated, WITH_DOLLARS)).toContain("est.");
  });
});

describe("escaping", () => {
  it("does not let a symbol name inject markup", () => {
    const hostile: DailyDigestData = {
      ...daily,
      movers: [
        { symbol: "<script>", name: "Bad & Co", changePercent: 2, changeAmount: 1 },
      ],
    };
    const html = renderHtml(hostile, WITH_DOLLARS);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Bad &amp; Co");
  });
});
