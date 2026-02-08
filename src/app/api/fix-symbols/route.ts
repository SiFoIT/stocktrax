import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { toYahooSymbol } from "@/lib/import/wealthsimple-parser";

export async function POST() {
  try {
    const allHoldings = await db.query.holdings.findMany();

    let updated = 0;
    const changes: { from: string; to: string }[] = [];

    for (const holding of allHoldings) {
      const newSymbol = toYahooSymbol(holding.symbol, holding.currency);
      if (newSymbol === holding.symbol) continue;

      await db
        .update(schema.holdings)
        .set({ symbol: newSymbol })
        .where(eq(schema.holdings.id, holding.id));

      changes.push({ from: holding.symbol, to: newSymbol });
      updated++;
    }

    return NextResponse.json({ updated, changes });
  } catch {
    return NextResponse.json(
      { error: "Failed to fix symbols" },
      { status: 500 }
    );
  }
}
