import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getQuote, getTimeSeries, type QuoteWithRange } from "@/lib/api/yahoo-finance";
import { eq } from "drizzle-orm";
import {
  Category,
  CATEGORIES,
  MarketSymbol,
  resolveSections,
  sectionSymbols,
} from "@/lib/markets/symbols";
import { catalogEntry } from "@/lib/markets/catalog";
import { getMarketSections } from "@/lib/settings";
import {
  DEFAULT_MARKET_RANGE,
  isMarketRange,
  MarketRange,
  RANGE_CONFIG,
} from "@/lib/markets/ranges";
import { ExtendedHoursData, FuturesQuote, MarketData, MarketsResponse } from "@/types";
import { buildSparkline, sparklineWindow, SparklineWindow } from "@/lib/markets/session";
import { CACHE_TTL } from "@/lib/config";

/**
 * Quotes and sparkline series are cached apart from each other: the quote is
 * short-lived so the price column is always fresh, while a 1Y series can sit
 * for an hour because its shape barely moves. The two are joined per request.
 *
 * Both are keyed per symbol rather than per category. The sections are the
 * user's to change, so a category-wide key would be invalidated by every edit;
 * per-symbol keys mean adding a row or flipping a pair fetches only that row.
 */
interface MarketQuote {
  symbol: string;
  name: string;
  short?: string;
  description?: string;
  price: number;
  change: number;
  changePercent: number;
  extendedHours?: ExtendedHoursData;
  futures?: FuturesQuote;
}

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
 * the card renders exactly as it did before this existed. The contract's name
 * is left out, because like the row's own labels it comes from the catalog on
 * every request rather than from the cache.
 */
function buildFuturesQuote(
  futures: { symbol: string } | undefined,
  quote: QuoteWithRange | null
): CachedFutures | undefined {
  if (!futures || !quote) return undefined;

  return {
    symbol: futures.symbol,
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    marketState: quote.extendedHours?.marketState,
    lastTradeTime: quote.lastTradeTime,
  };
}

/** Falls back to the bare code for a contract dropped from the catalog. */
function nameFutures(
  cached: CachedFutures | undefined,
  entry: { name: string } | undefined
): FuturesQuote | undefined {
  if (!cached) return undefined;
  return { ...cached, name: entry?.name ?? cached.symbol };
}

/**
 * The cached half of a quote. Labels are resolved from the catalog on every
 * request instead, so renaming an entry does not wait for a cache to expire.
 */
type CachedFutures = Omit<FuturesQuote, "name">;
type CachedQuote = Omit<MarketQuote, "name" | "short" | "description" | "futures"> & {
  futures?: CachedFutures;
};

async function fetchQuote(entry: MarketSymbol, skipCache: boolean): Promise<MarketQuote> {
  const labels = { name: entry.name, short: entry.short, description: entry.description };
  const cacheKey = `markets_quote_${entry.symbol}`;
  const cached = await readCache<CachedQuote>(cacheKey, CACHE_TTL.markets, skipCache);
  if (cached) {
    return { ...cached, ...labels, futures: nameFutures(cached.futures, entry.futures) };
  }

  try {
    const [quote, futuresQuote] = await Promise.all([
      getQuote(entry.symbol),
      // includeRange for lastTradeTime, which the card exposes as a tooltip
      // so a stale weekend quote is inspectable.
      entry.futures ? getQuote(entry.futures.symbol, true).catch(() => null) : Promise.resolve(null),
    ]);

    const fresh: CachedQuote = {
      symbol: entry.symbol,
      price: quote?.price ?? 0,
      change: quote?.change ?? 0,
      changePercent: quote?.changePercent ?? 0,
      extendedHours: quote?.extendedHours,
      futures: buildFuturesQuote(entry.futures, futuresQuote as QuoteWithRange | null),
    };

    await writeCache(cacheKey, fresh);
    return { ...fresh, ...labels, futures: nameFutures(fresh.futures, entry.futures) };
  } catch {
    // Not cached: a failed fetch should be retried on the next request rather
    // than held for the full TTL.
    return { symbol: entry.symbol, price: 0, change: 0, changePercent: 0, ...labels };
  }
}

async function fetchSeries(
  symbol: string,
  range: MarketRange,
  skipCache: boolean
): Promise<SparklineWindow> {
  const cacheKey = `markets_series_v3_${symbol}_${range}`;
  const cached = await readCache<SparklineWindow>(cacheKey, CACHE_TTL.marketSeries[range], skipCache);
  if (cached) return cached;

  const { period, interval, sessions } = RANGE_CONFIG[range];
  const series = await getTimeSeries(symbol, period, interval).catch(() => []);
  const window = sparklineWindow(series, sessions);

  await writeCache(cacheKey, window);
  return window;
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

async function fetchRows(
  entries: MarketSymbol[],
  range: MarketRange,
  skipCache: boolean
): Promise<MarketData[]> {
  return Promise.all(
    entries.map(async (entry) => {
      const [quote, window] = await Promise.all([
        fetchQuote(entry, skipCache),
        fetchSeries(entry.symbol, range, skipCache),
      ]);
      return joinQuote(quote, window, range);
    })
  );
}

/**
 * Symbols an alert rule still watches but no section shows any more, because
 * the user removed the row or flipped the pair. They are fetched and returned
 * apart from the visible rows so those rules keep evaluating instead of
 * silently going quiet, and stay editable in the alerts panel.
 */
async function hiddenAlertEntries(visible: Set<string>): Promise<MarketSymbol[]> {
  const rules = await db
    .select({ symbol: schema.alertRules.symbol })
    .from(schema.alertRules)
    .where(eq(schema.alertRules.scope, "market"));

  const orphans = [...new Set(rules.map((r) => r.symbol))].filter((s) => !visible.has(s));
  return orphans.map((symbol) => {
    const entry = catalogEntry(symbol);
    return {
      symbol,
      name: entry?.name ?? symbol,
      short: entry?.short,
      description: entry?.description,
    };
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const skipCache = url.searchParams.get("refresh") === "true";
  const rangeParam = url.searchParams.get("range");
  const range = isMarketRange(rangeParam) ? rangeParam : DEFAULT_MARKET_RANGE;

  const sections = await getMarketSections();
  const resolved = resolveSections(sections);
  const visible = new Set(sectionSymbols(sections));

  const [categoryResults, hidden] = await Promise.all([
    Promise.all(
      CATEGORIES.map(async (category) => ({
        category,
        data: await fetchRows(resolved[category], range, skipCache),
      }))
    ),
    hiddenAlertEntries(visible).then((entries) => fetchRows(entries, range, skipCache)),
  ]);

  const byCategory = {} as Record<Category, MarketData[]>;
  for (const { category, data } of categoryResults) {
    byCategory[category] = data;
  }

  const response: MarketsResponse = { ...byCategory, hidden, sections };
  return NextResponse.json(response);
}
