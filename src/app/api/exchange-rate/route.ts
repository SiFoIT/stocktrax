import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getQuote } from "@/lib/api/yahoo-finance";
import { eq } from "drizzle-orm";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY = "USDCAD_RATE";

export async function GET() {
  try {
    // Check cache
    const cached = await db.query.stockCache.findFirst({
      where: eq(schema.stockCache.symbol, CACHE_KEY),
    });

    if (cached) {
      const age = Date.now() - cached.fetchedAt.getTime();
      if (age < CACHE_TTL_MS) {
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
  } catch (error) {
    console.error("Exchange rate error:", error);
    return NextResponse.json(
      { error: "Failed to fetch exchange rate" },
      { status: 500 }
    );
  }
}
