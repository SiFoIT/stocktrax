import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getQuote, getTimeSeries } from "@/lib/api/yahoo-finance";
import { eq } from "drizzle-orm";
import { MARKET_SYMBOLS, Category, CATEGORIES } from "@/lib/markets/symbols";
import { MarketData } from "@/types";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
      if (age < CACHE_TTL_MS) {
        return JSON.parse(cached.data);
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
