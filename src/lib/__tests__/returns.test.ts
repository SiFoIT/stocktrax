import { describe, expect, it } from "vitest";
import {
  addMonths,
  closeOnOrBeforeDay,
  latestSessionOnOrBefore,
  periodBaselineDay,
  sessionsBefore,
  splitFactorAfter,
  xirr,
} from "../returns";

describe("closeOnOrBeforeDay", () => {
  const bars = [
    { day: "2026-11-05", close: 13.19 },
    { day: "2026-11-06", close: 12.81 },
    { day: "2026-11-09", close: 12.59 },
  ];
  it("takes the bar on the day itself", () => {
    expect(closeOnOrBeforeDay(bars, "2026-11-06")).toBe(12.81);
  });
  it("falls back across a weekend", () => {
    expect(closeOnOrBeforeDay(bars, "2026-11-08")).toBe(12.81);
  });
  it("is null before the first bar", () => {
    expect(closeOnOrBeforeDay(bars, "2026-11-04")).toBeNull();
  });
});

describe("sessions", () => {
  it("5D from a Saturday is the Friday a week earlier", () => {
    expect(periodBaselineDay("2026-11-14", "5D")).toBe("2026-11-06");
  });
  it("5D from a Wednesday is the previous Wednesday", () => {
    expect(periodBaselineDay("2026-11-11", "5D")).toBe("2026-11-04");
  });
  it("skips days both exchanges are closed", () => {
    // Christmas 2026-12-25 closes both NYSE and TSX.
    expect(latestSessionOnOrBefore("2026-12-25")).toBe("2026-12-24");
    expect(sessionsBefore("2026-12-28", 1)).toBe("2026-12-24");
  });

  it("counts a US-only holiday as a session (TSX trades)", () => {
    // US Thanksgiving 2026-11-26: NYSE closed, TSX open.
    expect(latestSessionOnOrBefore("2026-11-26")).toBe("2026-11-26");
    expect(sessionsBefore("2026-11-30", 2)).toBe("2026-11-26");
  });
});

describe("addMonths", () => {
  it("clamps to the end of a shorter month", () => {
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
  it("crosses a year", () => {
    expect(addMonths("2026-01-15", -3)).toBe("2025-10-15");
    expect(periodBaselineDay("2026-11-14", "1Y")).toBe("2025-11-14");
  });
});

describe("splitFactorAfter", () => {
  const splits = [{ day: "2024-06-10", ratio: 10 }];
  it("scales holdings counted before the split", () => {
    expect(splitFactorAfter(splits, "2024-06-07")).toBe(10);
  });
  it("leaves holdings after the split alone", () => {
    expect(splitFactorAfter(splits, "2024-06-10")).toBe(1);
  });
});

describe("xirr", () => {
  it("is 10% for one year at 10%", () => {
    const r = xirr([
      { day: "2025-01-01", amount: -1000 },
      { day: "2026-01-01", amount: 1100 },
    ]);
    expect(r).toBeCloseTo(10, 1);
  });

  it("does not credit late money with years of compounding", () => {
    // $1k in 2020, $99k a month before the end, +10% overall. The old
    // (MV/cost)^(1/years) formula said ~1.6%/yr; money-weighted is far higher.
    const r = xirr([
      { day: "2020-11-01", amount: -1000 },
      { day: "2026-10-01", amount: -99000 },
      { day: "2026-11-01", amount: 110000 },
    ])!;
    expect(r).toBeCloseTo(41.5, 0);
  });

  it("handles a loss", () => {
    const r = xirr([
      { day: "2025-01-01", amount: -1000 },
      { day: "2026-01-01", amount: 800 },
    ]);
    expect(r).toBeCloseTo(-20, 1);
  });

  it("is null without both directions or with too little history", () => {
    expect(xirr([{ day: "2025-01-01", amount: -1000 }])).toBeNull();
    expect(
      xirr([
        { day: "2026-11-01", amount: -1000 },
        { day: "2026-11-10", amount: 1010 },
      ])
    ).toBeNull();
  });
});
