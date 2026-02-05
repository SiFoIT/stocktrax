import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function recomputeHolding(holdingId: number) {
  const txns = await db.query.transactions.findMany({
    where: eq(schema.transactions.holdingId, holdingId),
  });

  let totalBuyShares = 0;
  let totalBuyCost = 0;
  let totalSellShares = 0;

  for (const txn of txns) {
    if (txn.type === "buy") {
      totalBuyShares += txn.shares;
      totalBuyCost += txn.shares * txn.price;
    } else if (txn.type === "sell") {
      totalSellShares += txn.shares;
    }
    // dividends don't affect shares/avgCost
  }

  const shares = Math.max(0, totalBuyShares - totalSellShares);
  const avgCost = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0;

  const [updated] = await db
    .update(schema.holdings)
    .set({ shares, avgCost })
    .where(eq(schema.holdings.id, holdingId))
    .returning();

  return updated;
}
