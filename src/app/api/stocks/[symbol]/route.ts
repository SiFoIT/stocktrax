import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getQuote, getTimeSeries, TimeSeriesInterval } from "@/lib/api/yahoo-finance";
import { eq } from "drizzle-orm";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const INTRADAY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for intraday

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();
  const url = new URL(request.url);
  const includeTimeSeries = url.searchParams.get("timeseries") === "true";
  const skipCache = url.searchParams.get("refresh") === "true";
  const period = (url.searchParams.get("period") || "1y") as "1d" | "5d" | "1mo" | "3mo" | "1y";
  const interval = (url.searchParams.get("interval") || "1d") as TimeSeriesInterval;

  const isIntraday = interval !== "1d";
  const cacheKey = `${upperSymbol}_${period}_${interval}`;
  const cacheTTL = isIntraday ? INTRADAY_CACHE_TTL_MS : CACHE_TTL_MS;

  // Check cache (skip if refresh requested)
  if (!skipCache) {
    const cached = await db.query.stockCache.findFirst({
      where: eq(schema.stockCache.symbol, cacheKey),
    });

    if (cached) {
      const age = Date.now() - cached.fetchedAt.getTime();
      if (age < cacheTTL) {
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
    timeSeries = await getTimeSeries(upperSymbol, period, interval);
  }

  const data = { quote, timeSeries: includeTimeSeries ? timeSeries : undefined };

  // Update cache
  await db
    .insert(schema.stockCache)
    .values({
      symbol: cacheKey,
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
