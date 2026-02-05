import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { recomputeHolding } from "@/lib/holdings";

export async function POST() {
  try {
    const allHoldings = await db.query.holdings.findMany();
    const results: Array<{
      holdingId: number;
      symbol: string;
      action: string;
      before: { shares: number; avgCost: number };
      after: { shares: number; avgCost: number };
    }> = [];

    for (const holding of allHoldings) {
      // Get all transactions for this holding
      const txns = await db.query.transactions.findMany({
        where: eq(schema.transactions.holdingId, holding.id),
      });

      // Compute what shares/avgCost should be from transactions
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
      }

      const computedShares = Math.max(0, totalBuyShares - totalSellShares);
      const computedAvgCost = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0;

      // Check if there's a mismatch
      const sharesDiff = Math.abs(holding.shares - computedShares);
      const avgCostDiff = Math.abs(holding.avgCost - computedAvgCost);

      if (sharesDiff > 0.001 || avgCostDiff > 0.001) {
        // Create an adjustment buy transaction to reconcile
        // This brings the computed values in line with the stored values
        if (holding.shares > computedShares) {
          // Need more shares - add a buy
          const adjustShares = holding.shares - computedShares;
          await db.insert(schema.transactions).values({
            holdingId: holding.id,
            type: "buy",
            shares: adjustShares,
            price: holding.avgCost,
            date: new Date(),
          });
        } else if (holding.shares < computedShares && holding.shares > 0) {
          // Too many shares - add a sell
          const adjustShares = computedShares - holding.shares;
          await db.insert(schema.transactions).values({
            holdingId: holding.id,
            type: "sell",
            shares: adjustShares,
            price: holding.avgCost,
            date: new Date(),
          });
        }

        // Recompute after adjustment
        const updated = await recomputeHolding(holding.id);

        results.push({
          holdingId: holding.id,
          symbol: holding.symbol,
          action: "adjusted",
          before: { shares: holding.shares, avgCost: holding.avgCost },
          after: { shares: updated.shares, avgCost: updated.avgCost },
        });
      } else {
        results.push({
          holdingId: holding.id,
          symbol: holding.symbol,
          action: "ok",
          before: { shares: holding.shares, avgCost: holding.avgCost },
          after: { shares: computedShares, avgCost: computedAvgCost },
        });
      }
    }

    return NextResponse.json({
      success: true,
      totalHoldings: allHoldings.length,
      adjusted: results.filter((r) => r.action === "adjusted").length,
      results,
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      { error: "Failed to migrate transactions" },
      { status: 500 }
    );
  }
}
