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

  const rows = await db
    .select({
      currency: schema.cashTransactions.currency,
      total: sql<number>`SUM(${schema.cashTransactions.amount})`,
    })
    .from(schema.cashTransactions)
    .where(eq(schema.cashTransactions.portfolioId, parseInt(portfolioId)))
    .groupBy(schema.cashTransactions.currency);

  const result: Record<string, number> = { cad: 0, usd: 0 };
  for (const row of rows) {
    const key = row.currency.toLowerCase();
    if (key === "cad" || key === "usd") {
      result[key] = row.total ?? 0;
    }
  }

  return NextResponse.json(result);
}
