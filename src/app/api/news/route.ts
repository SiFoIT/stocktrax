import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getNews, getNewsForSymbols } from "@/lib/api/yahoo-finance";
import { eq } from "drizzle-orm";
import { CACHE_TTL } from "@/lib/config";
import { parseNewsLimit } from "./limit";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol");
  const symbolsParam = url.searchParams.get("symbols");
  const limit = parseNewsLimit(url.searchParams.get("limit"));

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
      if (age < CACHE_TTL.news) {
        return NextResponse.json(JSON.parse(cached.data));
      }
    }

    // Fetch fresh data
    const news = await getNews(upperSymbol, limit);

    // getNews returns [] when Yahoo fails; caching that would hide the news
    // for the whole TTL, so only a non-empty result is cached.
    if (news.length > 0) await db
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
      if (age < CACHE_TTL.news) {
        return NextResponse.json(JSON.parse(cached.data));
      }
    }

    // Fetch fresh data - limit per symbol scales with total limit
    const limitPerSymbol = Math.max(2, Math.ceil(limit / symbols.length));
    const news = await getNewsForSymbols(symbols, limitPerSymbol);

    // Trim to requested limit
    const trimmedNews = news.slice(0, limit);

    // An empty result may be a failed fetch: don't cache it.
    if (trimmedNews.length > 0) await db
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
