import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getQuote, getTimeSeries } from "@/lib/api/yahoo-finance";
import { eq } from "drizzle-orm";
import { MARKET_SYMBOLS, Category, CATEGORIES } from "@/lib/markets/symbols";
import { MarketData } from "@/types";
import { buildSparkline } from "@/lib/markets/session";
import { CACHE_TTL } from "@/lib/config";

async function fetchCategoryData(category: Category, skipCache: boolean): Promise<MarketData[]> {
  const symbols = MARKET_SYMBOLS[category];
  const cacheKey = `markets_${category}`;

  // Check cache (skip if refresh requested)
  if (!skipCache) {
    const cached = await db.query.stockCache.findFirst({
      where: eq(schema.stockCache.symbol, cacheKey),
    });

    if (cached) {
      const age = Date.now() - cached.fetchedAt.getTime();
      if (age < CACHE_TTL.markets) {
        return JSON.parse(cached.data);
      }
    }
  }

  // Fetch fresh data for all symbols in parallel
  const marketData: MarketData[] = await Promise.all(
    symbols.map(async ({ symbol, name }) => {
      try {
        // 5d rather than 1d: a 1d window returns nothing over a weekend or
        // holiday, when the tile still has to show the last session.
        const [quote, timeSeries] = await Promise.all([
          getQuote(symbol),
          getTimeSeries(symbol, "5d", "5m"),
        ]);

        const price = quote?.price ?? 0;
        const change = quote?.change ?? 0;

        return {
          symbol,
          name,
          price,
          change,
          changePercent: quote?.changePercent ?? 0,
          sparklineData: buildSparkline(timeSeries, price, price - change),
          extendedHours: quote?.extendedHours,
        };
      } catch {
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

  return marketData;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const skipCache = url.searchParams.get("refresh") === "true";

  // Fetch all categories in parallel
  const results = await Promise.all(
    CATEGORIES.map(async (category) => ({
      category,
      data: await fetchCategoryData(category, skipCache),
    }))
  );

  // Return as a record keyed by category
  const response: Record<Category, MarketData[]> = {} as Record<Category, MarketData[]>;
  for (const { category, data } of results) {
    response[category] = data;
  }

  return NextResponse.json(response);
}
