import { describe, expect, it } from "vitest";
import { digestSubject, renderHtml, renderText } from "@/lib/digest/render";
import type { DailyDigestData, WeeklyDigestData } from "@/lib/digest/types";

const WITH_DOLLARS = { showDollars: true };
const NO_DOLLARS = { showDollars: false };

const daily: DailyDigestData = {
  kind: "daily",
  dateLabel: "Mon Sep 8, 2026",
  markets: [
    { label: "S&P 500", value: 6812.44, decimals: 0, changePercent: 0.6 },
    { label: "TSX", value: 29411.7, decimals: 0, changePercent: 0.3 },
    { label: "Nasdaq", value: 23104.9, decimals: 0, changePercent: 0.9 },
    { label: "CAD/USD", value: 0.7261, decimals: 3, changePercent: -0.2 },
  ],
  portfolio: {
    rows: [
      { name: "Dividend Portfolio", value: 184210, change: 1340, changePercent: 0.73 },
      { name: "TFSA", value: 42800, change: -310, changePercent: -0.72 },
    ],
    total: { name: "Total", value: 227010, change: 1030, changePercent: 0.46 },
  },
  movers: [
    { symbol: "NVDA", name: "NVIDIA", price: 124.18, changePercent: 4.1 },
    { symbol: "ENB.TO", name: "Enbridge", price: 56.4, changePercent: -1.9 },
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
    { label: "S&P 500", value: 6812.44, decimals: 0, changePercent: 1.1 },
    { label: "TSX", value: 29411.7, decimals: 0, changePercent: 0.8 },
    { label: "Nasdaq", value: 23104.9, decimals: 0, changePercent: 1.6 },
    { label: "CAD/USD", value: 0.7261, decimals: 3, changePercent: 0.4 },
  ],
  // A lone portfolio: its own row is the total, so no Total line is added.
  portfolio: {
    rows: [
      {
        name: "Dividend Portfolio",
        value: 184210,
        change: 2910,
        changePercent: 1.6,
        estimated: false,
      },
    ],
    total: null,
  },
  allTime: { amount: 22905, percent: 14.2, sinceLabel: "Mar 2021", cagr: 9.8, years: 5.5 },
  best: [{ symbol: "NVDA", name: "NVIDIA", price: 124.18, changePercent: 7.2 }],
  worst: [{ symbol: "ENB.TO", name: "Enbridge", price: 56.4, changePercent: -3 }],
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
        S&P 500        6,812  +0.6%
        TSX           29,412  +0.3%
        Nasdaq        23,105  +0.9%
        CAD/USD        0.726  −0.2%

      PORTFOLIO · TODAY
        Dividend Portfolio    $184,210    +$1,340   +0.73%
        TFSA                   $42,800      −$310   −0.72%
        Total                 $227,010    +$1,030   +0.46%

      MOVERS
        NVDA          $124.18   +4.1%
        ENB.TO         $56.40   −1.9%

      WATCHLIST · MOVES OVER 2%
        AMD           $168.40   +3.2%

      ALERTS FIRED
        NVDA: Last price at or above 120.00

      DIVIDENDS
        Received $84.00 from ENB.TO

      Closing prices · Values in CAD
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

describe("market tiles", () => {
  it("prints the level before the change, indices whole and FX to three places", () => {
    const html = renderHtml(daily, WITH_DOLLARS);
    expect(html).toContain("6,812");
    expect(html).toContain("29,412");
    expect(html).toContain("0.726");
    expect(html).toContain("+0.6%");
  });

  it("falls back to a dash when Yahoo returned nothing", () => {
    const dark: DailyDigestData = {
      ...daily,
      markets: [{ label: "S&P 500", value: null, decimals: 0, changePercent: null }],
    };
    expect(renderHtml(dark, WITH_DOLLARS)).toContain("&mdash;");
    expect(renderText(dark, WITH_DOLLARS)).toContain("—");
  });
});

describe("portfolio rows", () => {
  it("names each portfolio and totals them", () => {
    for (const output of [renderHtml(daily, WITH_DOLLARS), renderText(daily, WITH_DOLLARS)]) {
      expect(output).toContain("Dividend Portfolio");
      expect(output).toContain("TFSA");
      expect(output).toContain("Total");
    }
  });

  it("leaves a lone portfolio without a total that would repeat it", () => {
    const text = renderText(weekly, WITH_DOLLARS);
    expect(text).toContain("Dividend Portfolio");
    expect(text).not.toContain("Total");
  });

  it("keeps the names when dollar figures are switched off", () => {
    const html = renderHtml(daily, NO_DOLLARS);
    expect(html).toContain("Dividend Portfolio");
    expect(html).toContain("TFSA");
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
  const SIZES = ["184,210", "1,340", "2,910", "22,905", "33,150", "9,400", "84.00", "214", "1,870", "2,000", "42,800", "310", "227,010", "1,030"];

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
      portfolio: {
        ...weekly.portfolio!,
        rows: [{ ...weekly.portfolio!.rows[0], estimated: true }],
      },
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
        { symbol: "<script>", name: "Bad & Co", price: 1, changePercent: 2 },
      ],
    };
    const html = renderHtml(hostile, WITH_DOLLARS);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Bad &amp; Co");
  });
});
