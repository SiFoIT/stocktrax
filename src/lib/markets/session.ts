import { StockTimeSeries } from "@/types";

/** Longer than any intraday pause, shorter than an overnight break. */
const SESSION_GAP_MS = 90 * 60 * 1000;

/** 24/7 markets never gap, so their "session" is capped to a trailing day. */
const CONTINUOUS_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Enough shape for a 56px sparkline without shipping a full 5m series. */
const SPARKLINE_POINTS = 32;

/**
 * The closes of the most recent trading session.
 *
 * Sessions are found by looking for the last long gap between bars rather than
 * by calendar date, so this works for Tokyo and London as well as New York
 * without knowing any exchange's hours or timezone.
 */
export function lastSessionCloses(series: StockTimeSeries[]): number[] {
  const points = series
    .map((p) => ({ t: new Date(p.date).getTime(), close: p.close }))
    .filter((p) => Number.isFinite(p.t) && typeof p.close === "number" && p.close > 0);

  if (points.length === 0) return [];

  let start = 0;
  for (let i = points.length - 1; i > 0; i--) {
    if (points[i].t - points[i - 1].t > SESSION_GAP_MS) {
      start = i;
      break;
    }
  }

  // No gap found means a continuous market; fall back to a trailing window.
  const cutoff = points[points.length - 1].t - CONTINUOUS_WINDOW_MS;
  while (start < points.length - 1 && points[start].t < cutoff) start++;

  return points.slice(start).map((p) => p.close);
}

/** Evenly thin a series to at most `max` points, always keeping the last one. */
export function downsample(values: number[], max: number = SPARKLINE_POINTS): number[] {
  if (values.length <= max) return values;
  const step = (values.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => values[Math.round(i * step)]);
}

/**
 * Sparkline points for a market tile, covering the same period as the quote's
 * daily change.
 *
 * The line is anchored at the previous close and ends at the current price, so
 * its direction is the sign of `price - previousClose` by construction. That is
 * the same number the card prints and colours by, so a red line can never rise.
 * A session that opens with a gap shows that gap as the first segment, which is
 * what makes anchoring necessary: starting at the open would let the line climb
 * all session while the day is still down.
 */
export function buildSparkline(
  series: StockTimeSeries[],
  price: number,
  previousClose: number
): number[] {
  if (!(price > 0) || !(previousClose > 0)) return [];

  const session = downsample(lastSessionCloses(series));
  // With no intraday data, a two-point line still reports the day honestly.
  if (session.length === 0) return [previousClose, price];

  return [previousClose, ...session.slice(0, -1), price];
}
