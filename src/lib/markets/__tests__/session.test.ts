import { describe, expect, it } from "vitest";
import { monthsBefore, sparklineWindow } from "@/lib/markets/session";
import type { StockTimeSeries } from "@/types";

function bar(date: string, close: number): StockTimeSeries {
  return { date, open: close, high: close, low: close, close, volume: 0 } as StockTimeSeries;
}

describe("sparklineWindow by months", () => {
  const now = new Date("2026-09-15T20:00:00Z");
  const series = [
    bar("2026-08-13T20:00:00Z", 90),
    bar("2026-08-14T20:00:00Z", 100), // last close before the window
    bar("2026-08-17T20:00:00Z", 104), // first bar inside it
    bar("2026-09-14T20:00:00Z", 110),
  ];

  it("anchors at the close before the window, so the first bar's move counts", () => {
    const window = sparklineWindow(series, undefined, 1, now);
    expect(window.anchor).toBe(100);
    expect(window.closes).toEqual([104, 110]);
    expect(window.low).toBe(104);
    expect(window.high).toBe(110);
  });

  it("leaves the anchor unset when the fetch does not reach back that far", () => {
    const window = sparklineWindow(series.slice(2), undefined, 1, now);
    expect(window.anchor).toBeUndefined();
    expect(window.closes).toEqual([104, 110]);
  });

  it("keeps the whole fetch when neither sessions nor months is set", () => {
    expect(sparklineWindow(series).closes).toEqual([90, 100, 104, 110]);
  });
});

describe("monthsBefore", () => {
  it("clamps to the last day of a shorter month", () => {
    const now = new Date("2026-03-30T15:30:00Z");
    expect(new Date(monthsBefore(now, 1)).toISOString()).toBe("2026-02-28T15:30:00.000Z");
    expect(new Date(monthsBefore(new Date("2026-05-31T00:00:00Z"), 3)).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z"
    );
  });

  it("steps whole months otherwise, across years", () => {
    expect(new Date(monthsBefore(new Date("2026-01-15T12:00:00Z"), 12)).toISOString()).toBe(
      "2025-01-15T12:00:00.000Z"
    );
    expect(new Date(monthsBefore(new Date("2026-02-10T08:00:00Z"), 3)).toISOString()).toBe(
      "2025-11-10T08:00:00.000Z"
    );
  });
});
