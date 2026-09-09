import type { TimeSeriesInterval } from "@/lib/api/yahoo-finance";

/** The timeframes the Markets toolbar offers, in display order. */
export const MARKET_RANGES = ["1D", "5D", "1M", "3M", "1Y", "5Y"] as const;
export type MarketRange = (typeof MARKET_RANGES)[number];

export const DEFAULT_MARKET_RANGE: MarketRange = "1D";

export function isMarketRange(value: unknown): value is MarketRange {
  return typeof value === "string" && (MARKET_RANGES as readonly string[]).includes(value);
}

/**
 * The window spelled out, for places with room to read rather than scan.
 * The toolbar keeps the short codes; the details modal uses these.
 */
export const MARKET_RANGE_NAMES: Record<MarketRange, string> = {
  "1D": "1 Day",
  "5D": "5 Day",
  "1M": "1 Month",
  "3M": "3 Month",
  "1Y": "1 Year",
  "5Y": "5 Year",
};

type Period = "1d" | "5d" | "1mo" | "3mo" | "1y" | "2y" | "3y" | "5y" | "10y";

interface RangeConfig {
  /** What to ask Yahoo for. Intraday ranges fetch wider than they show. */
  period: Period;
  interval: TimeSeriesInterval;
  /**
   * When set, the window is the last N trading sessions found in the series
   * rather than the whole fetch, so "5D" means five sessions on a Monday too.
   */
  sessions?: number;
}

/**
 * Intraday ranges use the session finder, so they fetch a wider window than
 * they show and let the gaps in the data decide where sessions fall. Daily and
 * weekly ranges take the whole fetch as-is.
 */
export const RANGE_CONFIG: Record<MarketRange, RangeConfig> = {
  // 5d rather than 1d: a 1d window returns nothing over a weekend or holiday,
  // when the tile still has to show the last session.
  "1D": { period: "5d", interval: "5m", sessions: 1 },
  "5D": { period: "1mo", interval: "30m", sessions: 5 },
  "1M": { period: "1mo", interval: "1h" },
  "3M": { period: "3mo", interval: "1d" },
  "1Y": { period: "1y", interval: "1d" },
  "5Y": { period: "5y", interval: "1wk" },
};
