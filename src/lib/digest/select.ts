import type { DigestMover, DigestWatchlistRow } from "@/lib/digest/types";

/**
 * The digest's selection rules: which holdings count as movers, which
 * watchlist rows are worth a line, what "near a 52-week high" means.
 *
 * Deliberately free of database and network imports so the rules can be
 * unit-tested against fixtures without opening the user's SQLite file.
 */

/** A holding moves the daily list only if it actually moved. */
const MOVER_MIN_PCT = 1;
const MOVER_LIMIT = 3;
/** How close to a 52-week extreme still counts as "near" in the weekly. */
const NEAR_RANGE_PCT = 3;
/** Tolerance for calling a price a new 52-week high or low. */
const EXTREME_TOLERANCE = 0.001;

/** One symbol's position, merged across every portfolio that holds it. */
export interface MergedPosition {
  symbol: string;
  name: string;
  shares: number;
  /** In the symbol's own currency, as shown in the tables. */
  price: number;
  change: number;
  changePercent: number;
  /** Multiplier from the symbol's currency to CAD. */
  fx: number;
  valueCad: number;
}

// --- Pure selection rules (unit-tested against fixtures) ---

/**
 * Top gainers then top losers, each capped at `limit` and each required to
 * have moved more than `minPct`. A day where nothing moved yields an empty
 * list and the section disappears.
 *
 * The two groups are selected by how far they moved but printed as one
 * continuous descending run, so the biggest gain is at the top and the
 * biggest loss at the bottom.
 */
export function selectMovers(
  positions: MergedPosition[],
  minPct = MOVER_MIN_PCT,
  limit = MOVER_LIMIT
): DigestMover[] {
  const toMover = (p: MergedPosition): DigestMover => ({
    symbol: p.symbol,
    name: p.name,
    price: p.price,
    changePercent: p.changePercent,
  });

  const gainers = positions
    .filter((p) => p.changePercent > minPct)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, limit);

  const losers = positions
    .filter((p) => p.changePercent < -minPct)
    // Sorted worst-first to pick the right three, then flipped for display.
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, limit)
    .reverse();

  return [...gainers, ...losers].map(toMover);
}

/**
 * Watchlist rows worth mentioning in the daily. A threshold of zero turns the
 * section off entirely.
 *
 * Printed as one descending run, matching the movers list and the weekly
 * tables: biggest gain at the top, biggest loss at the bottom. Sorting by the
 * size of the move instead would drop a heavy faller into the middle of the
 * gainers, which is where it reads as a gain.
 */
export function selectWatchlistRows(
  rows: DigestWatchlistRow[],
  thresholdPct: number
): DigestWatchlistRow[] {
  if (thresholdPct <= 0) return [];
  return rows
    .filter((row) => Math.abs(row.changePercent) >= thresholdPct)
    .sort((a, b) => b.changePercent - a.changePercent);
}

/** Best and worst performers of the week, best-first and worst-first. */
export function selectBestWorst(
  movers: DigestMover[],
  limit = MOVER_LIMIT
): { best: DigestMover[]; worst: DigestMover[] } {
  const sorted = [...movers].sort((a, b) => b.changePercent - a.changePercent);
  return {
    best: sorted.filter((m) => m.changePercent > 0).slice(0, limit),
    worst: sorted
      .filter((m) => m.changePercent < 0)
      .reverse()
      .slice(0, limit),
  };
}

/** "near high" / "near low" / "" for a weekly watchlist row. */
export function rangeNote(
  price: number,
  high?: number,
  low?: number,
  withinPct = NEAR_RANGE_PCT
): string {
  if (high && price >= high * (1 - withinPct / 100)) return "near high";
  if (low && price <= low * (1 + withinPct / 100)) return "near low";
  return "";
}

/** Whether a quote is sitting at a fresh 52-week extreme. */
export function extremeNote(
  price: number,
  high?: number,
  low?: number
): "high" | "low" | null {
  if (high && price >= high * (1 - EXTREME_TOLERANCE)) return "high";
  if (low && price <= low * (1 + EXTREME_TOLERANCE)) return "low";
  return null;
}
