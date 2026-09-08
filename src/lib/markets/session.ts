import { StockTimeSeries } from "@/types";

/** Longer than any intraday pause, shorter than an overnight break. */
const SESSION_GAP_MS = 90 * 60 * 1000;

/** 24/7 markets never gap, so their "session" is a trailing day. */
const CONTINUOUS_SESSION_MS = 24 * 60 * 60 * 1000;

/** Enough shape for a 56px sparkline without shipping a full 5m series. */
const SPARKLINE_POINTS = 32;

interface Point {
  t: number;
  close: number;
}

function toPoints(series: StockTimeSeries[]): Point[] {
  return series
    .map((p) => ({ t: new Date(p.date).getTime(), close: p.close }))
    .filter((p) => Number.isFinite(p.t) && typeof p.close === "number" && p.close > 0);
}

/**
 * Split a series into trading sessions, oldest first.
 *
 * Sessions are found by looking for long gaps between bars rather than by
 * calendar date, so this works for Tokyo and London as well as New York
 * without knowing any exchange's hours or timezone. A series with no gaps at
 * all is a continuous market, and is cut into trailing 24-hour days instead.
 */
export function splitSessions(series: StockTimeSeries[]): number[][] {
  const points = toPoints(series);
  if (points.length === 0) return [];

  const sessions: number[][] = [[points[0].close]];
  for (let i = 1; i < points.length; i++) {
    if (points[i].t - points[i - 1].t > SESSION_GAP_MS) sessions.push([]);
    sessions[sessions.length - 1].push(points[i].close);
  }
  if (sessions.length > 1) return sessions;

  const last = points[points.length - 1].t;
  const days = new Map<number, number[]>();
  for (const p of points) {
    const day = Math.floor((last - p.t) / CONTINUOUS_SESSION_MS);
    const bucket = days.get(day) ?? [];
    bucket.push(p.close);
    days.set(day, bucket);
  }
  return [...days.keys()].sort((a, b) => b - a).map((day) => days.get(day)!);
}

/** The closes of the most recent trading session. */
export function lastSessionCloses(series: StockTimeSeries[]): number[] {
  const sessions = splitSessions(series);
  return sessions.length > 0 ? sessions[sessions.length - 1] : [];
}

/** Evenly thin a series to at most `max` points, always keeping the last one. */
export function downsample(values: number[], max: number = SPARKLINE_POINTS): number[] {
  if (values.length <= max) return values;
  const step = (values.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => values[Math.round(i * step)]);
}

/**
 * The closes a sparkline is drawn from, before the live price is attached.
 *
 * `anchor` is the close immediately before the window: the last close of the
 * session before the first shown one. It is what "change over the window"
 * is measured from, so a 5D change means "since the close five sessions ago"
 * the way a 1D change means "since yesterday's close". When the fetch does not
 * reach back far enough it is left undefined and the caller falls back to the
 * first close in the window.
 */
export interface SparklineWindow {
  anchor?: number;
  closes: number[];
}

/**
 * Pick out the window a range shows. With `sessions` set, that is the last N
 * sessions in the series; without it, the whole fetch.
 */
export function sparklineWindow(series: StockTimeSeries[], sessions?: number): SparklineWindow {
  if (sessions === undefined) {
    return { closes: downsample(toPoints(series).map((p) => p.close)) };
  }

  const all = splitSessions(series);
  const shown = all.slice(-sessions);
  const before = all[all.length - sessions - 1];
  return {
    anchor: before?.[before.length - 1],
    closes: downsample(shown.flat()),
  };
}

/**
 * Sparkline points for a market tile, anchored at the reference close and
 * ending at the current price.
 *
 * Anchoring means the line's direction is the sign of `price - anchor` by
 * construction, which is the same number the tile prints and colours by, so a
 * red line can never rise. A session that opens with a gap shows that gap as
 * the first segment, which is what makes anchoring necessary: starting at the
 * open would let the line climb all session while the day is still down.
 */
export function buildSparkline(closes: number[], price: number, anchor: number): number[] {
  if (!(price > 0) || !(anchor > 0)) return [];
  // With no intraday data, a two-point line still reports the window honestly.
  if (closes.length === 0) return [anchor, price];
  return [anchor, ...closes.slice(0, -1), price];
}
