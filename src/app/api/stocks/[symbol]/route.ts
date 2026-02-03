import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getQuote, getTimeSeries } from "@/lib/api/yahoo-finance";
import { eq } from "drizzle-orm";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();
  const url = new URL(request.url);
  const includeTimeSeries = url.searchParams.get("timeseries") === "true";
  const skipCache = url.searchParams.get("refresh") === "true";

  // Check cache (skip if refresh requested)
  if (!skipCache) {
    const cached = await db.query.stockCache.findFirst({
      where: eq(schema.stockCache.symbol, upperSymbol),
    });

    if (cached) {
      const age = Date.now() - cached.fetchedAt.getTime();
      if (age < CACHE_TTL_MS) {
        const data = JSON.parse(cached.data);
        if (!includeTimeSeries || data.timeSeries) {
          return NextResponse.json(data);
        }
      }
    }
  }

  // Fetch fresh data
  const quote = await getQuote(upperSymbol);
  if (!quote) {
    return NextResponse.json(
      { error: "Failed to fetch stock data" },
      { status: 500 }
    );
  }

  let timeSeries: Awaited<ReturnType<typeof getTimeSeries>> = [];
  if (includeTimeSeries) {
    timeSeries = await getTimeSeries(upperSymbol);
  }

  const data = { quote, timeSeries: includeTimeSeries ? timeSeries : undefined };

  // Update cache
  await db
    .insert(schema.stockCache)
    .values({
      symbol: upperSymbol,
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
}
