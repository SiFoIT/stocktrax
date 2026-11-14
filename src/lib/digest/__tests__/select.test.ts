import { describe, expect, it } from "vitest";
import {
  extremeNote,
  isCashLike,
  rangeNote,
  weeklyExtreme,
  selectBestWorst,
  selectMovers,
  selectWatchlistRows,
  type MergedPosition,
} from "@/lib/digest/select";
import { isQuietDay } from "@/lib/digest/types";
import type { DailyDigestData, DigestMover, DigestWatchlistRow } from "@/lib/digest/types";

function position(symbol: string, changePercent: number, over: Partial<MergedPosition> = {}): MergedPosition {
  return {
    symbol,
    name: symbol,
    shares: 10,
    price: 100,
    change: 1,
    changePercent,
    fx: 1,
    valueCad: 1000,
    ...over,
  };
}

function watchRow(symbol: string, changePercent: number): DigestWatchlistRow {
  return { symbol, name: symbol, price: 100, changePercent };
}

function mover(symbol: string, changePercent: number): DigestMover {
  return { symbol, name: symbol, price: 100, changePercent };
}

describe("selectMovers", () => {
  it("drops holdings that moved less than one percent", () => {
    const movers = selectMovers([
      position("FLAT", 0.4),
      position("EDGE", 1),
      position("REAL", 1.2),
    ]);

    expect(movers.map((m) => m.symbol)).toEqual(["REAL"]);
  });

  it("reads as one descending run, biggest gain first and biggest loss last", () => {
    const movers = selectMovers([
      position("A", 5),
      position("B", 4),
      position("C", 3),
      position("D", 2),
      position("W", -5),
      position("X", -4),
      position("Y", -3),
      position("Z", -2),
    ]);

    expect(movers.map((m) => m.symbol)).toEqual(["A", "B", "C", "Y", "X", "W"]);
    // The three worst are still the ones chosen, just printed in reverse.
    expect(movers.map((m) => m.changePercent)).toEqual([5, 4, 3, -3, -4, -5]);
  });

  it("carries the closing price through in the symbol's own currency", () => {
    const [usd] = selectMovers([position("NVDA", 4, { price: 124.18, fx: 1.36 })]);

    expect(usd.price).toBe(124.18);
  });

  it("returns nothing when the market barely moved", () => {
    expect(selectMovers([position("A", 0.2), position("B", -0.3)])).toEqual([]);
  });
});

describe("selectWatchlistRows", () => {
  it("keeps moves at or beyond the threshold, as one descending run", () => {
    const rows = selectWatchlistRows(
      [
        watchRow("SMALL", 1.2),
        watchRow("UP", 3.2),
        watchRow("DOWN", -5.1),
        watchRow("BEST", 8.1),
        watchRow("DIP", -2.4),
      ],
      2
    );

    expect(rows.map((r) => r.symbol)).toEqual(["BEST", "UP", "DIP", "DOWN"]);
  });

  it("treats a threshold of zero as the section being switched off", () => {
    expect(selectWatchlistRows([watchRow("AMD", 9)], 0)).toEqual([]);
  });
});

describe("selectBestWorst", () => {
  it("splits gainers and losers, each worst-to-best inwards", () => {
    const { best, worst } = selectBestWorst([
      mover("A", 7.2),
      mover("B", 4.1),
      mover("C", 2.3),
      mover("D", 0.2),
      mover("X", -1.1),
      mover("Y", -2.2),
      mover("Z", -3),
    ]);

    expect(best.map((m) => m.symbol)).toEqual(["A", "B", "C"]);
    expect(worst.map((m) => m.symbol)).toEqual(["Z", "Y", "X"]);
  });

  it("handles a week where everything fell", () => {
    const { best, worst } = selectBestWorst([mover("X", -1), mover("Y", -2)]);
    expect(best).toEqual([]);
    expect(worst.map((m) => m.symbol)).toEqual(["Y", "X"]);
  });
});

describe("range notes", () => {
  it("flags prices sitting near a 52-week extreme", () => {
    expect(rangeNote(98, 100, 50)).toBe("near high");
    expect(rangeNote(51, 100, 50)).toBe("near low");
    expect(rangeNote(75, 100, 50)).toBe("");
  });

  it("only calls a new high when the price actually reaches it", () => {
    expect(extremeNote(100, 100, 50)).toBe("high");
    expect(extremeNote(50, 100, 50)).toBe("low");
    expect(extremeNote(97, 100, 50)).toBeNull();
  });

  it("says nothing when Yahoo gave no range", () => {
    expect(rangeNote(100, undefined, undefined)).toBe("");
    expect(extremeNote(100, undefined, undefined)).toBeNull();
  });

  it("ignores cash-like savings ETFs", () => {
    // CASH.TO's 52-week range is 49.96 to 50.10; HISU-U.TO's is 100.00 to 100.35.
    expect(isCashLike(50.1, 49.96)).toBe(true);
    expect(isCashLike(100.35, 100)).toBe(true);
    expect(isCashLike(20.39, 10.89)).toBe(false);
    expect(extremeNote(50.1, 50.1, 49.96)).toBeNull();
    expect(rangeNote(50.09, 50.1, 49.96)).toBe("");
  });
});

describe("weeklyExtreme", () => {
  // 250 weekday closes before the baseline, then one week.
  const days = (start: string, n: number) => {
    const out: string[] = [];
    const d = new Date(`${start}T00:00:00Z`);
    while (out.length < n) {
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  };
  const priorDays = days("2025-11-10", 250);
  const baseline = priorDays[priorDays.length - 1];
  const weekDays = days(new Date(Date.parse(`${baseline}T00:00:00Z`) + 86400000).toISOString().slice(0, 10), 5);
  const weekEnd = weekDays[4];
  const yearStart = "2025-11-07";

  const series = (prior: (i: number) => number, week: number[]) => [
    ...priorDays.map((day, i) => ({ day, close: prior(i) })),
    ...weekDays.map((day, i) => ({ day, close: week[i] })),
  ];

  it("calls a close above every prior close a new high", () => {
    const bars = series((i) => 80 + (i % 20), [95, 101, 99, 98, 100]);
    expect(weeklyExtreme(bars, baseline, weekEnd, yearStart)).toBe("high");
  });

  it("does not fire for a price back near an old high", () => {
    const bars = series((i) => (i === 50 ? 120 : 80 + (i % 20)), [118, 119, 119.9, 118, 119]);
    expect(weeklyExtreme(bars, baseline, weekEnd, yearStart)).toBeNull();
  });

  it("calls a new low", () => {
    const bars = series((i) => 80 + (i % 20), [79, 78, 80, 81, 82]);
    expect(weeklyExtreme(bars, baseline, weekEnd, yearStart)).toBe("low");
  });

  it("skips a savings ETF creeping up by its interest", () => {
    const bars = series((i) => 50 + (i % 21) * 0.005, [50.11, 50.12, 50.12, 50.13, 50.13]);
    expect(weeklyExtreme(bars, baseline, weekEnd, yearStart)).toBeNull();
  });
});

describe("isQuietDay", () => {
  const base: DailyDigestData = {
    kind: "daily",
    dateLabel: "Mon Sep 8, 2026",
    markets: [],
    portfolio: {
      rows: [{ name: "Dividend Portfolio", value: 1000, change: 1, changePercent: 0.1 }],
      total: null,
    },
    movers: [],
    watchlist: [],
    watchlistThreshold: 2,
    alerts: [],
    dividends: [],
    importReminder: null,
    appUrl: "",
  };

  it("is quiet when nothing moved and nothing happened", () => {
    expect(isQuietDay(base, 0.5)).toBe(true);
  });

  it("is not quiet once the portfolio moves past the threshold", () => {
    const moved = {
      rows: [{ name: "Dividend Portfolio", value: 1000, change: 9, changePercent: -0.9 }],
      total: null,
    };
    expect(isQuietDay({ ...base, portfolio: moved }, 0.5)).toBe(false);
  });

  it("is not quiet when an alert fired", () => {
    expect(
      isQuietDay({
        ...base,
        alerts: [
          {
            symbol: "NVDA",
            metric: "last_price",
            value: 121,
            operator: "gte",
            threshold: 120,
            message: "above 120",
            count: 1,
          },
        ],
      }, 0.5)
    ).toBe(false);
  });

  it("is not quiet when a dividend arrived", () => {
    expect(isQuietDay({ ...base, dividends: [{ symbol: "ENB.TO", amount: 84 }] }, 0.5)).toBe(false);
  });
});
