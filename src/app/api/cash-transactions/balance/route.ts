import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const portfolioId = url.searchParams.get("portfolioId");

  if (!portfolioId) {
    return NextResponse.json(
      { error: "portfolioId is required" },
      { status: 400 }
    );
  }

  const pid = parseInt(portfolioId);

  // Cash in/out from cash_transactions (deposits, contributions, etc.)
  const cashRows = await db
    .select({
      currency: schema.cashTransactions.currency,
      total: sql<number>`SUM(${schema.cashTransactions.amount})`,
    })
    .from(schema.cashTransactions)
    .where(eq(schema.cashTransactions.portfolioId, pid))
    .groupBy(schema.cashTransactions.currency);

  // Stock transaction impact on cash: buys subtract, sells/dividends add
  // Join transactions → holdings to get portfolioId and currency
  const stockRows = await db
    .select({
      currency: schema.holdings.currency,
      buys: sql<number>`SUM(CASE WHEN ${schema.transactions.type} = 'buy' THEN ${schema.transactions.shares} * ${schema.transactions.price} ELSE 0 END)`,
      sells: sql<number>`SUM(CASE WHEN ${schema.transactions.type} = 'sell' THEN ${schema.transactions.shares} * ${schema.transactions.price} ELSE 0 END)`,
      dividends: sql<number>`SUM(CASE WHEN ${schema.transactions.type} = 'dividend' THEN ${schema.transactions.shares} * ${schema.transactions.price} ELSE 0 END)`,
    })
    .from(schema.transactions)
    .innerJoin(schema.holdings, eq(schema.transactions.holdingId, schema.holdings.id))
    .where(eq(schema.holdings.portfolioId, pid))
    .groupBy(schema.holdings.currency);

  const result: Record<string, number> = { cad: 0, usd: 0 };
  const totalDividends: Record<string, number> = { cad: 0, usd: 0 };

  for (const row of cashRows) {
    const key = row.currency.toLowerCase();
    if (key === "cad" || key === "usd") {
      result[key] += row.total ?? 0;
    }
  }

  for (const row of stockRows) {
    const key = row.currency.toLowerCase();
    if (key === "cad" || key === "usd") {
      result[key] -= row.buys ?? 0;
      result[key] += row.sells ?? 0;
      result[key] += row.dividends ?? 0;
      totalDividends[key] += row.dividends ?? 0;
    }
  }

  return NextResponse.json({ ...result, totalDividends });
}
