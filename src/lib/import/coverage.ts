import { db, schema } from "@/lib/db";
import { eq, max } from "drizzle-orm";
import { getSetting, getSettings, setSetting } from "@/lib/settings";
import { utcToDateStr } from "@/lib/digest/time";
import { coverageKey, type PortfolioCoverage } from "@/lib/digest/import-reminder";

/**
 * Record how far a CSV import reached. Only ever moves forward, so re-importing
 * an old statement cannot make a portfolio look behind again.
 */
export async function recordImportCoverage(
  portfolioId: number,
  coveredThrough: string
): Promise<void> {
  const key = coverageKey(portfolioId);
  const stored = await getSetting<string | null>(key, null);
  if (stored && stored >= coveredThrough) return;
  await setSetting(key, coveredThrough);
}

function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Every portfolio's coverage: the recorded import date where there is one,
 * otherwise its latest stock or cash transaction.
 */
export async function loadPortfolioCoverage(): Promise<PortfolioCoverage[]> {
  const [portfolios, recorded, stockLatest, cashLatest] = await Promise.all([
    db.query.portfolios.findMany(),
    getSettings("import.coveredThrough."),
    db
      .select({
        portfolioId: schema.holdings.portfolioId,
        latest: max(schema.transactions.date),
      })
      .from(schema.transactions)
      .innerJoin(schema.holdings, eq(schema.holdings.id, schema.transactions.holdingId))
      .groupBy(schema.holdings.portfolioId),
    db
      .select({
        portfolioId: schema.cashTransactions.portfolioId,
        latest: max(schema.cashTransactions.date),
      })
      .from(schema.cashTransactions)
      .groupBy(schema.cashTransactions.portfolioId),
  ]);

  // Transaction dates are date-only values stored at UTC midnight or noon, so
  // they are read as UTC calendar dates.
  const latestTxn = new Map<number, string | null>();
  for (const row of [...stockLatest, ...cashLatest]) {
    if (!row.latest) continue;
    const date = utcToDateStr(new Date(row.latest));
    latestTxn.set(row.portfolioId, later(latestTxn.get(row.portfolioId) ?? null, date));
  }

  return portfolios.map((p) => {
    const stored = recorded[coverageKey(p.id)];
    if (typeof stored === "string" && stored) {
      return { id: p.id, name: p.name, coveredThrough: stored, source: "import" as const };
    }
    const fallback = latestTxn.get(p.id) ?? null;
    return {
      id: p.id,
      name: p.name,
      coveredThrough: fallback,
      source: fallback ? ("transactions" as const) : ("none" as const),
    };
  });
}
