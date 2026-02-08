import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getQuote } from "@/lib/api/yahoo-finance";
import { eq } from "drizzle-orm";
import { CACHE_TTL } from "@/lib/config";
const CACHE_KEY = "USDCAD_RATE";

export async function GET() {
  try {
    // Check cache
    const cached = await db.query.stockCache.findFirst({
      where: eq(schema.stockCache.symbol, CACHE_KEY),
    });

    if (cached) {
      const age = Date.now() - cached.fetchedAt.getTime();
      if (age < CACHE_TTL.exchangeRate) {
        return NextResponse.json(JSON.parse(cached.data));
      }
    }

    // Fetch fresh rate
    const quote = await getQuote("USDCAD=X");
    if (!quote) {
      return NextResponse.json(
        { error: "Failed to fetch exchange rate" },
        { status: 500 }
      );
    }

    const data = { rate: quote.price };

    // Update cache
    await db
      .insert(schema.stockCache)
      .values({
        symbol: CACHE_KEY,
        data: JSON.stringify(data),
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.stockCache.symbol,
        set: {
          data: JSON.stringify(data),
          fetchedAt: new Date(),
        },
      });

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch exchange rate" },
      { status: 500 }
    );
  }
}
