/**
 * The shape the renderers consume. Deliberately plain numbers and strings: no
 * Drizzle rows and no Yahoo types leak in here, so `render.ts` stays pure and
 * the builders can be tested against fixtures.
 *
 * All money is CAD, matching the portfolio dashboard. Per-symbol `price` stays
 * in the symbol's own currency, as it does everywhere else in the app.
 */

export interface DigestMarketTile {
  label: string;
  /** The index level or FX rate. Null when Yahoo returned nothing. */
  value: number | null;
  /** Decimals for `value`: 0 for an index level, 3 for the FX rate. */
  decimals: number;
  /** Null when Yahoo returned nothing; the tile renders a dash. */
  changePercent: number | null;
}

/** One portfolio's line, or the total across them all. */
export interface DigestPortfolioRow {
  name: string;
  value: number;
  change: number;
  changePercent: number;
  /**
   * True when the week's change came from re-pricing today's holdings a week
   * back rather than from a stored snapshot, which ignores mid-week trades.
   */
  estimated?: boolean;
}

export interface DigestPortfolioSection {
  /** One row per portfolio holding something, largest first. */
  rows: DigestPortfolioRow[];
  /** Null with a single portfolio, whose own row is already the total. */
  total: DigestPortfolioRow | null;
}

/** The line the digest speaks about as "the portfolio": the total, or the only one. */
export function portfolioTotal(
  section: DigestPortfolioSection | null
): DigestPortfolioRow | null {
  if (!section) return null;
  return section.total ?? section.rows[0] ?? null;
}

/** A holding's move over the period, with its impact on the portfolio. */
export interface DigestMover {
  symbol: string;
  name: string;
  changePercent: number;
  changeAmount: number;
}

export interface DigestWatchlistRow {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  /** "near high" / "near low" / "" — weekly tables only. */
  rangeNote?: string;
}

export interface DigestAlertRow {
  symbol: string;
  message: string;
}

export interface DigestDividendRow {
  symbol: string;
  amount: number;
}

export interface DailyDigestData {
  kind: "daily";
  /** "Mon Sep 8, 2026" */
  dateLabel: string;
  markets: DigestMarketTile[];
  portfolio: DigestPortfolioSection | null;
  movers: DigestMover[];
  watchlist: DigestWatchlistRow[];
  /** Echoed into the watchlist section heading. */
  watchlistThreshold: number;
  alerts: DigestAlertRow[];
  dividends: DigestDividendRow[];
  appUrl: string;
}

export interface DigestAllTime {
  amount: number;
  percent: number;
  /** "Mar 2021" — the month of the earliest transaction. */
  sinceLabel: string;
  cagr: number;
  years: number;
}

export interface DigestHoldingRow {
  symbol: string;
  price: number;
  weekPercent: number;
  value: number;
  weekAmount: number;
}

export interface DigestFiftyTwoWeekNote {
  symbol: string;
  kind: "high" | "low";
}

export interface DigestWeeklyFacts {
  fiftyTwoWeek: DigestFiftyTwoWeekNote[];
  dividends: { total: number; symbols: string[]; ytd: number } | null;
  nextWeekExDiv: { symbol: string; weekday: string }[];
  activity: { buys: number; sells: number; netCash: number } | null;
  alerts: { count: number; topSymbol: string | null; topCount: number } | null;
  topHolding: { symbol: string; percent: number } | null;
}

export interface DigestWatchlistGroup {
  name: string;
  rows: DigestWatchlistRow[];
}

export interface WeeklyDigestData {
  kind: "weekly";
  /** "Sep 1 – 5, 2026" */
  rangeLabel: string;
  markets: DigestMarketTile[];
  portfolio: DigestPortfolioSection | null;
  allTime: DigestAllTime | null;
  best: DigestMover[];
  worst: DigestMover[];
  facts: DigestWeeklyFacts;
  holdings: DigestHoldingRow[];
  watchlists: DigestWatchlistGroup[];
  appUrl: string;
}

export type DigestData = DailyDigestData | WeeklyDigestData;

export interface RenderOptions {
  /** Privacy switch: when false every dollar figure is dropped. */
  showDollars: boolean;
}

/**
 * Whether a daily digest is worth sending. Used only when "skip quiet days" is
 * on: a flat day with no alerts and no dividends says nothing worth an email.
 */
export function isQuietDay(data: DailyDigestData, thresholdPct: number): boolean {
  if (data.alerts.length > 0) return false;
  if (data.dividends.length > 0) return false;
  const movePct = Math.abs(portfolioTotal(data.portfolio)?.changePercent ?? 0);
  return movePct < thresholdPct;
}
