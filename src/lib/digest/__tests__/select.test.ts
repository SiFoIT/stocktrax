import { describe, expect, it } from "vitest";
import {
  extremeNote,
  rangeNote,
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
  return { symbol, name: symbol, changePercent, changeAmount: changePercent * 10 };
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

  it("converts the dollar impact through the exchange rate", () => {
    const [usd] = selectMovers([
      position("NVDA", 4, { shares: 100, change: 2, fx: 1.36 }),
    ]);

    expect(usd.changeAmount).toBeCloseTo(272, 6);
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
    expect(isQuietDay({ ...base, alerts: [{ symbol: "NVDA", message: "above 120" }] }, 0.5)).toBe(false);
  });

  it("is not quiet when a dividend arrived", () => {
    expect(isQuietDay({ ...base, dividends: [{ symbol: "ENB.TO", amount: 84 }] }, 0.5)).toBe(false);
  });
});
