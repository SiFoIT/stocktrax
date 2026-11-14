import { describe, expect, it } from "vitest";
import { sparklineWindow } from "@/lib/markets/session";
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
