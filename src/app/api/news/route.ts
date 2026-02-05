import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getNews, getNewsForSymbols } from "@/lib/api/yahoo-finance";
import { eq } from "drizzle-orm";

const NEWS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol");
  const symbolsParam = url.searchParams.get("symbols");
  const limit = parseInt(url.searchParams.get("limit") || "5", 10);

  // Single symbol request
  if (symbol) {
    const upperSymbol = symbol.toUpperCase();
    const cacheKey = `news_${upperSymbol}_${limit}`;

    // Check cache
    const cached = await db.query.stockCache.findFirst({
      where: eq(schema.stockCache.symbol, cacheKey),
    });

    if (cached) {
      const age = Date.now() - cached.fetchedAt.getTime();
      if (age < NEWS_CACHE_TTL_MS) {
        return NextResponse.json(JSON.parse(cached.data));
      }
    }

    // Fetch fresh data
    const news = await getNews(upperSymbol, limit);

    // Update cache
    await db
      .insert(schema.stockCache)
      .values({
        symbol: cacheKey,
        data: JSON.stringify(news),
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.stockCache.symbol,
        set: {
          data: JSON.stringify(news),
          fetchedAt: new Date(),
        },
      });

    return NextResponse.json(news);
  }

  // Multiple symbols request
  if (symbolsParam) {
    const symbols = symbolsParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (symbols.length === 0) {
      return NextResponse.json(
        { error: "No valid symbols provided" },
        { status: 400 }
      );
    }

    const cacheKey = `news_multi_${symbols.sort().join("_")}_${limit}`;

    // Check cache
    const cached = await db.query.stockCache.findFirst({
      where: eq(schema.stockCache.symbol, cacheKey),
    });

    if (cached) {
      const age = Date.now() - cached.fetchedAt.getTime();
      if (age < NEWS_CACHE_TTL_MS) {
        return NextResponse.json(JSON.parse(cached.data));
      }
    }

    // Fetch fresh data - limit per symbol scales with total limit
    const limitPerSymbol = Math.max(2, Math.ceil(limit / symbols.length));
    const news = await getNewsForSymbols(symbols, limitPerSymbol);

    // Trim to requested limit
    const trimmedNews = news.slice(0, limit);

    // Update cache
    await db
      .insert(schema.stockCache)
      .values({
        symbol: cacheKey,
        data: JSON.stringify(trimmedNews),
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.stockCache.symbol,
        set: {
          data: JSON.stringify(trimmedNews),
          fetchedAt: new Date(),
        },
      });

    return NextResponse.json(trimmedNews);
  }

  return NextResponse.json(
    { error: "Either symbol or symbols parameter is required" },
    { status: 400 }
  );
}
