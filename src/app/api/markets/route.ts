import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getQuote, getTimeSeries, type QuoteWithRange } from "@/lib/api/yahoo-finance";
import { eq } from "drizzle-orm";
import { MARKET_SYMBOLS, Category, CATEGORIES } from "@/lib/markets/symbols";
import {
  DEFAULT_MARKET_RANGE,
  isMarketRange,
  MarketRange,
  RANGE_CONFIG,
} from "@/lib/markets/ranges";
import { ExtendedHoursData, FuturesQuote, MarketData } from "@/types";
import { buildSparkline, sparklineWindow, SparklineWindow } from "@/lib/markets/session";
import { CACHE_TTL } from "@/lib/config";

/**
 * Quotes and sparkline series are cached apart from each other: the quote is
 * short-lived so the price column is always fresh, while a 1Y series can sit
 * for an hour because its shape barely moves. The two are joined per request.
 */
interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  extendedHours?: ExtendedHoursData;
  futures?: FuturesQuote;
}

type SeriesByCategory = Record<string, SparklineWindow>;

async function readCache<T>(key: string, ttl: number, skipCache: boolean): Promise<T | null> {
  if (skipCache) return null;
  const cached = await db.query.stockCache.findFirst({
    where: eq(schema.stockCache.symbol, key),
  });
  if (!cached) return null;
  const age = Date.now() - cached.fetchedAt.getTime();
  return age < ttl ? (JSON.parse(cached.data) as T) : null;
}

async function writeCache(key: string, value: unknown): Promise<void> {
  const data = JSON.stringify(value);
  await db
    .insert(schema.stockCache)
    .values({ symbol: key, data, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.stockCache.symbol,
      set: { data, fetchedAt: new Date() },
    });
}

/**
 * A futures quote is strictly additive: if Yahoo has nothing for the contract,
 * the card renders exactly as it did before this existed.
 */
function buildFuturesQuote(
  futures: { symbol: string; label: string } | undefined,
  quote: QuoteWithRange | null
): FuturesQuote | undefined {
  if (!futures || !quote) return undefined;

  return {
    symbol: futures.symbol,
    label: futures.label,
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    marketState: quote.extendedHours?.marketState,
    lastTradeTime: quote.lastTradeTime,
  };
}

async function fetchQuotes(category: Category, skipCache: boolean): Promise<MarketQuote[]> {
  const cacheKey = `markets_quotes_${category}`;
  const cached = await readCache<MarketQuote[]>(cacheKey, CACHE_TTL.markets, skipCache);
  if (cached) return cached;

  const quotes: MarketQuote[] = await Promise.all(
    MARKET_SYMBOLS[category].map(async ({ symbol, name, futures }) => {
      try {
        const [quote, futuresQuote] = await Promise.all([
          getQuote(symbol),
          // includeRange for lastTradeTime, which the card exposes as a tooltip
          // so a stale weekend quote is inspectable.
          futures ? getQuote(futures.symbol, true).catch(() => null) : Promise.resolve(null),
        ]);

        return {
          symbol,
          name,
          price: quote?.price ?? 0,
          change: quote?.change ?? 0,
          changePercent: quote?.changePercent ?? 0,
          extendedHours: quote?.extendedHours,
          futures: buildFuturesQuote(futures, futuresQuote as QuoteWithRange | null),
        };
      } catch {
        return { symbol, name, price: 0, change: 0, changePercent: 0 };
      }
    })
  );

  await writeCache(cacheKey, quotes);
  return quotes;
}

async function fetchSeries(
  category: Category,
  range: MarketRange,
  skipCache: boolean
): Promise<SeriesByCategory> {
  const cacheKey = `markets_series_v2_${category}_${range}`;
  const cached = await readCache<SeriesByCategory>(cacheKey, CACHE_TTL.marketSeries[range], skipCache);
  if (cached) return cached;

  const { period, interval, sessions } = RANGE_CONFIG[range];
  const entries = await Promise.all(
    MARKET_SYMBOLS[category].map(async ({ symbol }) => {
      const series = await getTimeSeries(symbol, period, interval).catch(() => []);
      return [symbol, sparklineWindow(series, sessions)] as const;
    })
  );

  const result: SeriesByCategory = Object.fromEntries(entries);
  await writeCache(cacheKey, result);
  return result;
}

/**
 * Join a quote to its window. On 1D the anchor is the quote's own previous
 * close, so the printed change is exactly Yahoo's daily change. On every other
 * range the anchor is the close before the window, or its first close when
 * the fetch did not reach back that far.
 */
function joinQuote(quote: MarketQuote, window: SparklineWindow | undefined, range: MarketRange): MarketData {
  const closes = window?.closes ?? [];
  const daily = range === "1D";
  const anchor = daily ? quote.price - quote.change : (window?.anchor ?? closes[0] ?? 0);

  const rangeChange = daily ? quote.change : quote.price - anchor;
  const rangeChangePercent = daily
    ? quote.changePercent
    : anchor > 0
      ? (rangeChange / anchor) * 100
      : 0;

  // The live price can sit outside a cached window's extremes for a while,
  // so widen them: a price at a new high should read as 0.0% off the high.
  const hasExtremes = window?.low !== undefined && window?.high !== undefined && quote.price > 0;
  const rangeLow = hasExtremes ? Math.min(window.low!, quote.price) : undefined;
  const rangeHigh = hasExtremes ? Math.max(window.high!, quote.price) : undefined;

  return {
    ...quote,
    rangeChange,
    rangeChangePercent,
    sparklineData: buildSparkline(closes, quote.price, anchor),
    rangeLow,
    rangeHigh,
  };
}

async function fetchCategoryData(
  category: Category,
  range: MarketRange,
  skipCache: boolean
): Promise<MarketData[]> {
  const [quotes, series] = await Promise.all([
    fetchQuotes(category, skipCache),
    fetchSeries(category, range, skipCache),
  ]);
  return quotes.map((quote) => joinQuote(quote, series[quote.symbol], range));
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const skipCache = url.searchParams.get("refresh") === "true";
  const rangeParam = url.searchParams.get("range");
  const range = isMarketRange(rangeParam) ? rangeParam : DEFAULT_MARKET_RANGE;

  // Fetch all categories in parallel
  const results = await Promise.all(
    CATEGORIES.map(async (category) => ({
      category,
      data: await fetchCategoryData(category, range, skipCache),
    }))
  );

  // Return as a record keyed by category
  const response: Record<Category, MarketData[]> = {} as Record<Category, MarketData[]>;
  for (const { category, data } of results) {
    response[category] = data;
  }

  return NextResponse.json(response);
}
