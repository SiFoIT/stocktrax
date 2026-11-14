import { db, schema } from "@/lib/db";
import { and, desc, eq, lte } from "drizzle-orm";
import { getPortfolioSummary } from "@/lib/portfolio-summary";

/**
 * Daily portfolio value snapshots: a value history, one row per portfolio per
 * trading day, for a future value-history chart.
 *
 * Not used for the weekly change. A stored value can't see trades imported
 * after it was taken (CSV imports arrive weeks late), and differencing two
 * values counts money moved in as gain. The weekly instead values Friday's
 * position from the transaction ledger and nets out trades since; see
 * `weekReturn` in `portfolio-summary.ts`.
 */

export interface SnapshotTotals {
  date: string;
  marketValue: number;
  costBasis: number;
}

/**
 * Write one row per portfolio for `date`, unless that date already has rows.
 * Idempotent by design: the scheduler may call it more than once a day and a
 * later call must not overwrite the value recorded at the scheduled time.
 */
export async function writeSnapshots(date: string): Promise<boolean> {
  const existing = await db.query.portfolioSnapshots.findFirst({
    where: eq(schema.portfolioSnapshots.date, date),
  });
  if (existing) return false;

  const summary = await getPortfolioSummary();
  if (summary.portfolios.length === 0) return false;
  // Rows are never overwritten, so an incomplete summary (a quote or the
  // exchange rate failed) must not be stored; the scheduler retries every
  // minute until the day ends.
  if (summary.missing) {
    console.warn("[digest] snapshot deferred: incomplete prices", summary.missing);
    return false;
  }

  for (const portfolio of summary.portfolios) {
    await db
      .insert(schema.portfolioSnapshots)
      .values({
        portfolioId: portfolio.id,
        date,
        marketValue: portfolio.marketValue,
        costBasis: portfolio.costBasis,
        dayChange: portfolio.todayReturn,
        currency: "CAD",
      })
      .onConflictDoNothing();
  }

  return true;
}

/** The most recent snapshot for one portfolio on or before `date`. */
export async function getSnapshot(portfolioId: number, onOrBefore: string) {
  return db.query.portfolioSnapshots.findFirst({
    where: and(
      eq(schema.portfolioSnapshots.portfolioId, portfolioId),
      lte(schema.portfolioSnapshots.date, onOrBefore)
    ),
    orderBy: [desc(schema.portfolioSnapshots.date)],
  });
}

/**
 * Combined value across all portfolios as of the latest snapshot date on or
 * before `onOrBefore`. Rows from a single date only, so a portfolio that was
 * created mid-week cannot be mixed with another portfolio's older row.
 */
export async function getSnapshotTotals(onOrBefore: string): Promise<SnapshotTotals | null> {
  const latest = await db.query.portfolioSnapshots.findFirst({
    where: lte(schema.portfolioSnapshots.date, onOrBefore),
    orderBy: [desc(schema.portfolioSnapshots.date)],
  });
  if (!latest) return null;

  const rows = await db
    .select()
    .from(schema.portfolioSnapshots)
    .where(eq(schema.portfolioSnapshots.date, latest.date));

  return {
    date: latest.date,
    marketValue: rows.reduce((sum, row) => sum + row.marketValue, 0),
    costBasis: rows.reduce((sum, row) => sum + row.costBasis, 0),
  };
}
