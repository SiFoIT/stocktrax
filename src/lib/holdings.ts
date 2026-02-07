import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

type DbOrTx = BaseSQLiteDatabase<"sync", unknown, typeof schema>;

export async function recomputeHolding(holdingId: number, dbOrTx: DbOrTx = db) {
  const txns = await dbOrTx.query.transactions.findMany({
    where: eq(schema.transactions.holdingId, holdingId),
  });

  let totalBuyShares = 0;
  let totalBuyCost = 0;
  let totalSellShares = 0;

  for (const txn of txns) {
    if (txn.type === "buy" || txn.type === "transfer_in") {
      totalBuyShares += txn.shares;
      totalBuyCost += txn.shares * txn.price;
    } else if (txn.type === "sell") {
      totalSellShares += txn.shares;
    }
    // dividends don't affect shares/avgCost
  }

  // Round to 6 decimal places to eliminate floating point dust (e.g. 1.42e-14)
  const shares = Math.max(0, Math.round((totalBuyShares - totalSellShares) * 1e6) / 1e6);
  const avgCost = shares > 0 && totalBuyShares > 0
    ? Math.round((totalBuyCost / totalBuyShares) * 1e6) / 1e6
    : 0;

  const [updated] = await dbOrTx
    .update(schema.holdings)
    .set({ shares, avgCost })
    .where(eq(schema.holdings.id, holdingId))
    .returning();

  return updated;
}
