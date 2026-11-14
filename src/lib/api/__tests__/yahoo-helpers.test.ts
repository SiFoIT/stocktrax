import { describe, expect, it } from "vitest";
import { barDay, dividendFields } from "../yahoo-finance";
import { closeOnOrBeforeDay } from "@/lib/returns";

describe("barDay", () => {
  it("keeps a Toronto/New York bar on its own day", () => {
    // Daily bars are stamped at the 9:30 ET open.
    expect(barDay(new Date("2026-11-06T14:30:00Z"), -18000)).toBe("2026-11-06");
    expect(barDay(new Date("2026-07-06T13:30:00Z"), -14400)).toBe("2026-07-06");
  });

  it("moves a Sydney bar stamped the previous UTC evening to its session day", () => {
    expect(barDay(new Date("2026-11-10T23:00:00Z"), 39600)).toBe("2026-11-11");
  });

  it("gives the weekly digest Friday's close, not Thursday's (the T.TO -8% bug)", () => {
    const bars = [
      { day: barDay(new Date("2026-11-05T14:30:00Z"), -18000), close: 13.19 },
      { day: barDay(new Date("2026-11-06T14:30:00Z"), -18000), close: 12.81 },
    ];
    expect(closeOnOrBeforeDay(bars, "2026-11-06")).toBe(12.81);
  });
});

describe("dividendFields", () => {
  it("passes stock fields through", () => {
    expect(dividendFields({ dividendRate: 1.68, dividendYield: 0.032 })).toEqual({
      dividendRate: 1.68,
      dividendYield: 0.032,
    });
  });

  it("derives an ETF's rate from its yield", () => {
    const f = dividendFields({ yield: 0.0161, previousClose: 45.58 });
    expect(f.dividendYield).toBe(0.0161);
    expect(f.dividendRate).toBeCloseTo(0.7338, 3);
  });

  it("is empty with nothing to go on", () => {
    expect(dividendFields({})).toEqual({});
    expect(dividendFields(undefined)).toEqual({});
  });
});

describe("mergeHistory", () => {
  it("rebases stored adjusted closes when a new dividend changes Yahoo's basis", async () => {
    const { mergeHistory } = await import("../yahoo-finance");
    // Stored before a $1 dividend on a $100 fund: adj == close.
    const stored = {
      bars: [
        { day: "2026-11-02", close: 100, adj: 100 },
        { day: "2026-11-03", close: 100, adj: 100 },
      ],
      splits: [],
      dividends: [],
    };
    // Fetched after it went ex on 11-04: Yahoo now reports the old days at 99.
    const recent = {
      bars: [
        { day: "2026-11-03", close: 100, adj: 99 },
        { day: "2026-11-04", close: 99, adj: 99 },
      ],
      splits: [],
      dividends: [{ day: "2026-11-04", amount: 1 }],
    };
    const merged = mergeHistory(stored, recent);
    expect(merged.bars.map((b) => b.adj)).toEqual([99, 99, 99]);
    // Total return across the ex-date is flat (price fell by the dividend).
    expect(merged.bars[2].adj! / merged.bars[0].adj!).toBe(1);
    expect(merged.dividends).toHaveLength(1);
  });

  it("leaves a series without adjusted closes alone", async () => {
    const { mergeHistory } = await import("../yahoo-finance");
    const merged = mergeHistory(
      { bars: [{ day: "2026-11-02", close: 10 }], splits: [], dividends: [] },
      { bars: [{ day: "2026-11-03", close: 11 }], splits: [], dividends: [] }
    );
    expect(merged.bars).toEqual([
      { day: "2026-11-02", close: 10 },
      { day: "2026-11-03", close: 11 },
    ]);
  });
});

describe("exchangeDay", () => {
  it("dates a midnight-London bar to its London day in summer and winter", async () => {
    const { exchangeDay } = await import("../yahoo-finance");
    // USDCAD=X bars are stamped 00:00 Europe/London.
    expect(exchangeDay(new Date("2026-06-16T23:00:00Z"), "Europe/London", 0)).toBe("2026-06-17");
    expect(exchangeDay(new Date("2026-01-16T00:00:00Z"), "Europe/London", 0)).toBe("2026-01-16");
  });

  it("keeps a Toronto open on its own day", async () => {
    const { exchangeDay } = await import("../yahoo-finance");
    expect(exchangeDay(new Date("2026-07-06T13:30:00Z"), "America/Toronto", -18000)).toBe("2026-07-06");
  });
});
