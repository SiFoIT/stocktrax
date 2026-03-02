import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getQuote, getTimeSeries, getHistoricalChanges, getStockDetails, getDividendInfo, getInsiderInfo, getInsiderDetails, TimeSeriesInterval } from "@/lib/api/yahoo-finance";
import { eq } from "drizzle-orm";
import { CACHE_TTL } from "@/lib/config";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();
  const url = new URL(request.url);
  const includeTimeSeries = url.searchParams.get("timeseries") === "true";
  const skipCache = url.searchParams.get("refresh") === "true";
  const period = (url.searchParams.get("period") || "1y") as "1d" | "5d" | "1mo" | "3mo" | "1y" | "2y" | "3y" | "5y" | "10y";
  const interval = (url.searchParams.get("interval") || "1d") as TimeSeriesInterval;

  const includeChanges = url.searchParams.get("changes") === "true";
  const includeDetails = url.searchParams.get("details") === "true";
  const includeDividends = url.searchParams.get("dividends") === "true";
  const includeRange = url.searchParams.get("range") === "true";
  const includeInsider = url.searchParams.get("insider") === "true";
  const includeInsiderDetails = url.searchParams.get("insiderDetails") === "true";

  // Handle insider details request separately
  if (includeInsiderDetails) {
    const insiderDetailsCacheKey = `${upperSymbol}_insider_details`;

    if (!skipCache) {
      const cached = await db.query.stockCache.findFirst({
        where: eq(schema.stockCache.symbol, insiderDetailsCacheKey),
      });

      if (cached) {
        const age = Date.now() - cached.fetchedAt.getTime();
        if (age < CACHE_TTL.insider) {
          return NextResponse.json(JSON.parse(cached.data));
        }
      }
    }

    const insiderDetailsData = await getInsiderDetails(upperSymbol);

    await db
      .insert(schema.stockCache)
      .values({
        symbol: insiderDetailsCacheKey,
        data: JSON.stringify(insiderDetailsData),
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.stockCache.symbol,
        set: {
          data: JSON.stringify(insiderDetailsData),
          fetchedAt: new Date(),
        },
      });

    return NextResponse.json(insiderDetailsData);
  }

  // Handle details request separately (different data structure)
  if (includeDetails) {
    const detailsCacheKey = `${upperSymbol}_details`;

    if (!skipCache) {
      const cached = await db.query.stockCache.findFirst({
        where: eq(schema.stockCache.symbol, detailsCacheKey),
      });

      if (cached) {
        const age = Date.now() - cached.fetchedAt.getTime();
        if (age < CACHE_TTL.stockQuote) {
          return NextResponse.json(JSON.parse(cached.data));
        }
      }
    }

    const details = await getStockDetails(upperSymbol);
    if (!details) {
      return NextResponse.json(
        { error: "Failed to fetch stock details" },
        { status: 500 }
      );
    }

    await db
      .insert(schema.stockCache)
      .values({
        symbol: detailsCacheKey,
        data: JSON.stringify(details),
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.stockCache.symbol,
        set: {
          data: JSON.stringify(details),
          fetchedAt: new Date(),
        },
      });

    return NextResponse.json(details);
  }

  const isIntraday = interval !== "1d";
  const cacheKey = includeChanges ? `${upperSymbol}_changes` : `${upperSymbol}_${period}_${interval}`;
  const cacheTTL = isIntraday ? CACHE_TTL.stockIntraday : CACHE_TTL.stockQuote;

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
  const quote = await getQuote(upperSymbol, includeRange);
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

  let historicalChanges: Awaited<ReturnType<typeof getHistoricalChanges>> = {};
  if (includeChanges) {
    historicalChanges = await getHistoricalChanges(upperSymbol);
  }

  let dividendInfo: Awaited<ReturnType<typeof getDividendInfo>> = {};
  if (includeDividends) {
    dividendInfo = await getDividendInfo(upperSymbol);
  }

  let insiderInfo: Awaited<ReturnType<typeof getInsiderInfo>> = {};
  if (includeInsider) {
    // Check insider-specific cache first (6hr TTL)
    const insiderCacheKey = `${upperSymbol}_insider`;
    let insiderCached = false;

    if (!skipCache) {
      const cached = await db.query.stockCache.findFirst({
        where: eq(schema.stockCache.symbol, insiderCacheKey),
      });
      if (cached) {
        const age = Date.now() - cached.fetchedAt.getTime();
        if (age < CACHE_TTL.insider) {
          insiderInfo = JSON.parse(cached.data);
          insiderCached = true;
        }
      }
    }

    if (!insiderCached) {
      insiderInfo = await getInsiderInfo(upperSymbol);
      await db
        .insert(schema.stockCache)
        .values({
          symbol: insiderCacheKey,
          data: JSON.stringify(insiderInfo),
          fetchedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.stockCache.symbol,
          set: {
            data: JSON.stringify(insiderInfo),
            fetchedAt: new Date(),
          },
        });
    }
  }

  const data = {
    quote,
    timeSeries: includeTimeSeries ? timeSeries : undefined,
    historicalChanges: includeChanges ? historicalChanges : undefined,
    dividendInfo: includeDividends ? dividendInfo : undefined,
    insiderInfo: includeInsider ? insiderInfo : undefined,
  };

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
