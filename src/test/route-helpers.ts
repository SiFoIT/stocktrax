// Helpers for the route handler tests (`*.route.test.ts`). Import these only
// from a route test: `@/lib/db` opens the throwaway DB that setup-route-db.ts
// points STOCKTRAX_DB_PATH at, and must not be loaded anywhere else.
import { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export { db, schema };

// Refuse to run against anything but the throwaway file: resetDatabase()
// empties every table.
const expectedPath = process.env.STOCKTRAX_DB_PATH;
if (!expectedPath || db.$client.name !== expectedPath || !expectedPath.includes("stocktrax-route-tests-")) {
  throw new Error(
    `Route tests must run against the temp DB from src/test/setup-route-db.ts, got ${db.$client.name}`
  );
}

/** The stock_cache key the dashboard summary is cached under. */
export const SUMMARY_CACHE_KEY = "PORTFOLIO_SUMMARY_V2";

// Children first, so foreign keys never block a wipe.
const TABLES_IN_DELETE_ORDER = [
  "alerts",
  "alert_rules",
  "transactions",
  "portfolio_snapshots",
  "cash_transactions",
  "holdings",
  "portfolios",
  "watchlist_items",
  "watchlists",
  "screens",
  "screen_presets",
  "settings",
  "stock_cache",
  "digest_log",
] as const;

/** Empty every table and reset autoincrement counters, for a `beforeEach`. */
export function resetDatabase(): void {
  for (const table of TABLES_IN_DELETE_ORDER) {
    db.run(sql.raw(`DELETE FROM "${table}"`));
  }
  db.run(sql.raw(`DELETE FROM sqlite_sequence`));
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** A NextRequest for `path` (e.g. "/api/transactions?id=1") with an optional JSON body. */
export function apiRequest(method: Method, path: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(path, "http://localhost"), {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}

/** The second argument Next passes to a dynamic route handler. */
export function routeParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

// Response bodies are untyped JSON; tests assert on their shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJson(response: Response): Promise<any> {
  return response.json();
}

/** Put a stale dashboard summary in the cache, as a prior GET would have. */
export function seedSummaryCache(): void {
  db.insert(schema.stockCache)
    .values({ symbol: SUMMARY_CACHE_KEY, data: "{}", fetchedAt: new Date() })
    .run();
}

/** Whether the dashboard summary is still cached. */
export function summaryCached(): boolean {
  return (
    db.select().from(schema.stockCache).where(eq(schema.stockCache.symbol, SUMMARY_CACHE_KEY)).all()
      .length > 0
  );
}

export function seedPortfolio(values: Partial<typeof schema.portfolios.$inferInsert> = {}) {
  return db
    .insert(schema.portfolios)
    .values({ name: "Test", currency: "CAD", ...values })
    .returning()
    .get();
}

export function seedHolding(
  portfolioId: number,
  values: Partial<typeof schema.holdings.$inferInsert> = {}
) {
  return db
    .insert(schema.holdings)
    .values({ portfolioId, symbol: "AAPL", shares: 0, avgCost: 0, currency: "USD", ...values })
    .returning()
    .get();
}

export function seedWatchlist(name = "Main") {
  return db.insert(schema.watchlists).values({ name }).returning().get();
}

export function seedWatchlistItem(watchlistId: number, symbol: string) {
  return db.insert(schema.watchlistItems).values({ watchlistId, symbol }).returning().get();
}

export function holdingById(id: number) {
  return db.select().from(schema.holdings).where(eq(schema.holdings.id, id)).get();
}

export function alertRuleById(id: number) {
  return db.select().from(schema.alertRules).where(eq(schema.alertRules.id, id)).get();
}
