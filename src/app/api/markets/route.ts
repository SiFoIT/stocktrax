import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getQuote, getTimeSeries } from "@/lib/api/yahoo-finance";
import { eq } from "drizzle-orm";
import { MARKET_SYMBOLS, Region } from "@/lib/markets/symbols";
import { MarketData } from "@/types";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const region = url.searchParams.get("region") as Region | null;
  const skipCache = url.searchParams.get("refresh") === "true";

  if (!region || !MARKET_SYMBOLS[region]) {
    return NextResponse.json(
      { error: "Invalid region. Valid regions: canada, us, europe, asia, crypto" },
      { status: 400 }
    );
  }

  const symbols = MARKET_SYMBOLS[region];
  const cacheKey = `markets_${region}`;

  // Check cache (skip if refresh requested)
  if (!skipCache) {
    const cached = await db.query.stockCache.findFirst({
      where: eq(schema.stockCache.symbol, cacheKey),
    });

    if (cached) {
      const age = Date.now() - cached.fetchedAt.getTime();
      if (age < CACHE_TTL_MS) {
        return NextResponse.json(JSON.parse(cached.data));
      }
    }
  }

  // Fetch fresh data for all symbols in parallel
  const marketData: MarketData[] = await Promise.all(
    symbols.map(async ({ symbol, name }) => {
      try {
        const [quote, timeSeries] = await Promise.all([
          getQuote(symbol),
          getTimeSeries(symbol, "5d", "1d"),
        ]);

        const sparklineData = timeSeries
          .slice(-5)
          .map((ts) => ts.close)
          .filter((v): v is number => v !== null && v !== undefined);

        return {
          symbol,
          name,
          price: quote?.price ?? 0,
          change: quote?.change ?? 0,
          changePercent: quote?.changePercent ?? 0,
          sparklineData,
        };
      } catch (error) {
        console.error(`Error fetching market data for ${symbol}:`, error);
        return {
          symbol,
          name,
          price: 0,
          change: 0,
          changePercent: 0,
          sparklineData: [],
        };
      }
    })
  );

  // Update cache
  await db
    .insert(schema.stockCache)
    .values({
      symbol: cacheKey,
      data: JSON.stringify(marketData),
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.stockCache.symbol,
      set: {
        data: JSON.stringify(marketData),
        fetchedAt: new Date(),
      },
    });

  return NextResponse.json(marketData);
}
