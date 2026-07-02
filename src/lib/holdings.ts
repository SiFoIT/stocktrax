import { db, schema } from "@/lib/db";
import { asc, eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

type DbOrTx = BaseSQLiteDatabase<"sync", unknown, typeof schema>;

/**
 * Recompute a holding's shares and average cost from its transaction history
 * using average-cost-basis (ACB) accounting.
 *
 * Buys add shares and cost. Sells remove shares and reduce the cost basis
 * proportionally at the running average (so already-sold lots no longer affect
 * the average cost of shares bought later). A position that reaches zero resets
 * its basis, so a sell-then-rebuy starts fresh at the rebuy price.
 *
 * Runs synchronously so it can be called inside a better-sqlite3 transaction and
 * participate in its rollback. Existing `await recomputeHolding(...)` callers
 * continue to work (awaiting a plain value is a no-op).
 */
export function recomputeHolding(holdingId: number, dbOrTx: DbOrTx = db) {
  const txns = dbOrTx
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.holdingId, holdingId))
    .orderBy(asc(schema.transactions.date), asc(schema.transactions.id))
    .all();

  let runningShares = 0;
  let runningCost = 0; // total cost basis of shares currently held

  for (const txn of txns) {
    if (txn.type === "buy" || txn.type === "transfer_in") {
      runningShares += txn.shares;
      runningCost += txn.shares * txn.price;
    } else if (txn.type === "sell") {
      const avgBefore = runningShares > 0 ? runningCost / runningShares : 0;
      runningShares -= txn.shares;
      if (runningShares <= 1e-9) {
        // Position fully closed (or oversold) — reset basis.
        runningShares = 0;
        runningCost = 0;
      } else {
        runningCost -= txn.shares * avgBefore;
      }
    }
    // dividends don't affect shares/avgCost
  }

  // Round to 6 decimal places to eliminate floating point dust (e.g. 1.42e-14)
  const shares = Math.max(0, Math.round(runningShares * 1e6) / 1e6);
  const avgCost =
    shares > 0 && runningCost > 0
      ? Math.round((runningCost / shares) * 1e6) / 1e6
      : 0;

  const [updated] = dbOrTx
    .update(schema.holdings)
    .set({ shares, avgCost })
    .where(eq(schema.holdings.id, holdingId))
    .returning()
    .all();

  return updated;
}
