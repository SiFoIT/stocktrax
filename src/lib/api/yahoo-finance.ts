import YahooFinance from "yahoo-finance2";
import { addMonths, closeOnOrBeforeDay, type DailyBar, type Split } from "@/lib/returns";
import { cached, createBatcher, type CacheOptions } from "@/lib/market-data/cache";
import { recordYahooCall } from "@/lib/market-data/stats";
import { addDays } from "@/lib/digest/time";
import { StockQuote, StockTimeSeries, NewsArticle, ExtendedHoursData, MarketState, InsiderTransaction, InsiderDetails, InstitutionalOwnership, InstitutionalHolder } from "@/types";

const yahooFinance = new YahooFinance();

/**
 * Yahoo's answer for a symbol that has no fundamentals at all (an index, some
 * ETFs and FX pairs). It is a real answer, not an outage: it is cached as an
 * empty result rather than counted as an error and retried every minute.
 */
const NO_DATA = /no fundamentals data found/i;

/** Run one Yahoo request and count it (and any failure) for the status page. */
async function track<T>(kind: string, symbol: string, request: Promise<T>): Promise<T> {
  try {
    const result = await request;
    recordYahooCall(kind, true, symbol);
    return result;
  } catch (error) {
    if (error instanceof Error && NO_DATA.test(error.message)) {
      recordYahooCall(kind, true, symbol);
      return {} as T;
    }
    recordYahooCall(kind, false, symbol, error);
    throw error;
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Quotes: fresh enough for 15-minute-delayed data, and every caller shares them. */
const QUOTE_TTL = 2 * MINUTE;
/** A quote older than this is not served in place of a failed fetch. */
const QUOTE_MAX_STALE = 30 * MINUTE;
/** Daily history is topped up with the last few sessions at most this often. */
const HISTORY_TTL = HOUR;
/** Fundamentals, dividend and profile data change daily at most. */
const SUMMARY_TTL = 12 * HOUR;
const INSIDER_TTL = 24 * HOUR;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractExtendedHours(quote: any): ExtendedHoursData | undefined {
  const state = quote.marketState as MarketState | undefined;
  if (!state) return undefined;

  const data: ExtendedHoursData = { marketState: state };

  if (quote.preMarketPrice != null) {
    data.preMarketPrice = quote.preMarketPrice;
    data.preMarketChange = quote.preMarketChange;
    data.preMarketChangePercent = quote.preMarketChangePercent;
    if (quote.preMarketTime) {
      data.preMarketTime = new Date(quote.preMarketTime).toISOString();
    }
  }

  if (quote.postMarketPrice != null) {
    data.postMarketPrice = quote.postMarketPrice;
    data.postMarketChange = quote.postMarketChange;
    data.postMarketChangePercent = quote.postMarketChangePercent;
    if (quote.postMarketTime) {
      data.postMarketTime = new Date(quote.postMarketTime).toISOString();
    }
  }

  // Only return if there's actual extended hours price data (beyond just marketState)
  if (data.preMarketPrice != null || data.postMarketPrice != null) {
    return data;
  }
  // Still return marketState for state-based display logic
  return { marketState: state };
}

export interface HistoricalChanges {
  change5D?: number;
  change1M?: number;
  change3M?: number;
  change1Y?: number;
  change5Y?: number;
}

export async function getHistoricalChanges(symbol: string): Promise<HistoricalChanges> {
  const history = await getDailyHistory(symbol, fiveYearsAgo());
  if (!history) return {};
  return historicalChangesFrom(history.bars);
}

/** 5D/1M/3M/1Y/5Y change from daily bars, ending at the latest bar. */
export function historicalChangesFrom(bars: DailyBar[]): HistoricalChanges {
  if (bars.length === 0) return {};
  const currentPrice = bars[bars.length - 1].close;
  // Anchor on the latest session's date, not the current instant: the
  // baseline must not move with the hour this happens to be computed.
  const latestDay = bars[bars.length - 1].day;
  const priceMonthsAgo = (months: number): number | undefined =>
    closeOnOrBeforeDay(bars, addMonths(latestDay, -months)) ?? undefined;

  // 5D means 5 *trading* days, so index back 5 bars in the daily series
  // rather than 5 calendar days (which is only ~3 trading days).
  const price5D = bars.length > 5 ? bars[bars.length - 1 - 5].close : undefined;

  const calcChange = (oldPrice: number | undefined): number | undefined => {
    if (oldPrice === undefined || oldPrice === 0) return undefined;
    return ((currentPrice - oldPrice) / oldPrice) * 100;
  };

  // A 5Y change needs the series to actually reach five years back.
  const reaches = (months: number) => bars[0].day <= addMonths(latestDay, -months);

  return {
    change5D: calcChange(price5D),
    change1M: calcChange(priceMonthsAgo(1)),
    change3M: calcChange(priceMonthsAgo(3)),
    change1Y: reaches(12) ? calcChange(priceMonthsAgo(12)) : undefined,
    change5Y: reaches(60) ? calcChange(priceMonthsAgo(60)) : undefined,
  };
}

export interface StockDetails {
  // Basic info
  symbol: string;
  /** Currency of the financial statements (revenue, EBITDA, cash, debt). */
  financialCurrency?: string;
  shortName?: string;
  longName?: string;
  exchange?: string;
  currency?: string;
  quoteType?: string;

  // Price info
  price?: number;
  change?: number;
  changePercent?: number;
  previousClose?: number;
  open?: number;
  dayHigh?: number;
  dayLow?: number;
  volume?: number;
  avgVolume?: number;
  lastTradeTime?: string;

  // 52-week
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekChange?: number;

  // Moving averages
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;

  // Valuation
  marketCap?: number;
  enterpriseValue?: number;
  trailingPE?: number;
  forwardPE?: number;
  priceToBook?: number;
  priceToSales?: number;

  // Dividends
  dividendRate?: number;
  dividendYield?: number;
  exDividendDate?: string;
  payoutRatio?: number;

  // Financials
  revenue?: number;
  revenuePerShare?: number;
  grossProfit?: number;
  ebitda?: number;
  netIncome?: number;
  eps?: number;
  forwardEps?: number;

  // Profitability
  profitMargin?: number;
  operatingMargin?: number;
  returnOnAssets?: number;
  returnOnEquity?: number;

  // Balance sheet
  totalCash?: number;
  totalDebt?: number;
  debtToEquity?: number;
  currentRatio?: number;
  bookValue?: number;

  // Shares
  sharesOutstanding?: number;
  floatShares?: number;
  sharesShort?: number;
  shortRatio?: number;
  shortPercentOfFloat?: number;

  // Analyst
  targetHighPrice?: number;
  targetLowPrice?: number;
  targetMeanPrice?: number;
  recommendationMean?: number;
  recommendationKey?: string;
  numberOfAnalystOpinions?: number;

  // Other
  beta?: number;
  earningsDate?: string;
  sector?: string;
  industry?: string;
  website?: string;
  description?: string;

  // Extended hours
  extendedHours?: ExtendedHoursData;
}

const DETAIL_MODULES = [
  "price",
  "summaryDetail",
  "defaultKeyStatistics",
  "financialData",
  "calendarEvents",
  "summaryProfile",
] as const;

type DetailSummary = Awaited<ReturnType<typeof fetchDetailSummary>>;

function fetchDetailSummary(symbol: string) {
  return track("summary", symbol, yahooFinance.quoteSummary(symbol, { modules: [...DETAIL_MODULES] }));
}

export async function getStockDetails(symbol: string, options: CacheOptions = {}): Promise<StockDetails | null> {
  try {
    const [quote, summary] = await Promise.all([
      getRawQuote(symbol, options),
      cached<DetailSummary>(`y:sum:${symbol}`, SUMMARY_TTL, () => fetchDetailSummary(symbol)),
    ]);

    if (!quote) return null;

    const price = summary?.price;
    const detail = summary?.summaryDetail;
    const keyStats = summary?.defaultKeyStatistics;
    const financial = summary?.financialData;
    const calendar = summary?.calendarEvents;
    const profile = summary?.summaryProfile;

    return {
      // Basic info
      symbol: quote.symbol,
      shortName: quote.shortName,
      longName: quote.longName,
      exchange: quote.exchange,
      currency: quote.currency,
      quoteType: quote.quoteType,

      // Price info
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      previousClose: quote.regularMarketPreviousClose,
      open: quote.regularMarketOpen,
      dayHigh: quote.regularMarketDayHigh,
      dayLow: quote.regularMarketDayLow,
      volume: quote.regularMarketVolume,
      avgVolume: quote.averageDailyVolume3Month,
      lastTradeTime: quote.regularMarketTime
        ? new Date(quote.regularMarketTime).toISOString()
        : undefined,

      // 52-week
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      fiftyTwoWeekChange: keyStats?.["52WeekChange"],

      // Moving averages
      fiftyDayAverage: quote.fiftyDayAverage,
      twoHundredDayAverage: quote.twoHundredDayAverage,

      // Valuation
      marketCap: price?.marketCap,
      enterpriseValue: keyStats?.enterpriseValue,
      trailingPE: detail?.trailingPE,
      forwardPE: keyStats?.forwardPE,
      priceToBook: keyStats?.priceToBook,
      // Yahoo reports P/S in summaryDetail, not defaultKeyStatistics.
      priceToSales: detail?.priceToSalesTrailing12Months,

      // Dividends
      ...dividendFields(detail),
      exDividendDate: detail?.exDividendDate
        ? new Date(detail.exDividendDate).toISOString().split("T")[0]
        : undefined,
      payoutRatio: detail?.payoutRatio,

      // Financials
      revenue: financial?.totalRevenue,
      revenuePerShare: financial?.revenuePerShare,
      grossProfit: financial?.grossProfits,
      ebitda: financial?.ebitda,
      netIncome: keyStats?.netIncomeToCommon,
      eps: keyStats?.trailingEps,
      forwardEps: keyStats?.forwardEps,

      // Profitability
      profitMargin: financial?.profitMargins,
      operatingMargin: financial?.operatingMargins,
      returnOnAssets: financial?.returnOnAssets,
      returnOnEquity: financial?.returnOnEquity,

      // Balance sheet
      totalCash: financial?.totalCash,
      totalDebt: financial?.totalDebt,
      // Yahoo reports debt/equity percent-scaled (e.g. 145 = 1.45x); normalize to a ratio.
      debtToEquity: financial?.debtToEquity != null ? financial.debtToEquity / 100 : undefined,
      currentRatio: financial?.currentRatio,
      bookValue: keyStats?.bookValue,

      // Shares
      sharesOutstanding: keyStats?.sharesOutstanding,
      floatShares: keyStats?.floatShares,
      sharesShort: keyStats?.sharesShort,
      shortRatio: keyStats?.shortRatio,
      shortPercentOfFloat: keyStats?.shortPercentOfFloat,

      // Analyst
      targetHighPrice: financial?.targetHighPrice,
      targetLowPrice: financial?.targetLowPrice,
      targetMeanPrice: financial?.targetMeanPrice,
      recommendationMean: financial?.recommendationMean,
      recommendationKey: financial?.recommendationKey,
      numberOfAnalystOpinions: financial?.numberOfAnalystOpinions,

      // Other
      beta: keyStats?.beta,
      earningsDate: calendar?.earnings?.earningsDate?.[0]
        ? new Date(calendar.earnings.earningsDate[0]).toISOString().split("T")[0]
        : undefined,
      sector: profile?.sector,
      industry: profile?.industry,
      website: profile?.website,
      description: profile?.longBusinessSummary,

      // Extended hours
      extendedHours: extractExtendedHours(quote),
    };
  } catch {
    return null;
  }
}

/**
 * Forward dividend rate and yield. Stocks report `dividendRate` and
 * `dividendYield`; ETFs and funds report only `yield` (trailing distribution
 * yield, a fraction), so derive the rate from it and the last close rather
 * than letting every ETF's income read as zero.
 */
export function dividendFields(detail: {
  dividendRate?: number;
  dividendYield?: number;
  yield?: number;
  previousClose?: number;
} | undefined): { dividendRate?: number; dividendYield?: number } {
  if (!detail) return {};
  if (detail.dividendRate != null || detail.dividendYield != null) {
    return { dividendRate: detail.dividendRate, dividendYield: detail.dividendYield };
  }
  if (detail.yield != null && detail.yield > 0) {
    return {
      dividendYield: detail.yield,
      dividendRate: detail.previousClose ? detail.yield * detail.previousClose : undefined,
    };
  }
  return {};
}

export interface DividendInfo {
  dividendRate?: number;
  dividendYield?: number;
  exDividendDate?: string;
  dividendDate?: string;
  payoutRatio?: number;
  trailingAnnualDividendYield?: number;
  fiveYearAvgDividendYield?: number;
  sector?: string;
}

export async function getDividendInfo(symbol: string): Promise<DividendInfo> {
  const info = await cached<DividendInfo>(`y:div:${symbol}`, SUMMARY_TTL, () => fetchDividendInfo(symbol));
  return info ?? {};
}

async function fetchDividendInfo(symbol: string): Promise<DividendInfo | null> {
  try {
    const summary = await track(
      "summary",
      symbol,
      yahooFinance.quoteSummary(symbol, { modules: ["summaryDetail", "calendarEvents", "summaryProfile"] })
    );

    const detail = summary?.summaryDetail;
    const calendar = summary?.calendarEvents;
    const profile = summary?.summaryProfile;

    return {
      ...dividendFields(detail),
      exDividendDate: detail?.exDividendDate
        ? new Date(detail.exDividendDate).toISOString().split("T")[0]
        : undefined,
      dividendDate: calendar?.dividendDate
        ? new Date(calendar.dividendDate).toISOString().split("T")[0]
        : undefined,
      payoutRatio: detail?.payoutRatio,
      trailingAnnualDividendYield: detail?.trailingAnnualDividendYield,
      fiveYearAvgDividendYield: detail?.fiveYearAvgDividendYield,
      sector: profile?.sector,
    };
  } catch {
    return null;
  }
}

export interface QuoteWithRange extends StockQuote {
  shortName?: string;
  dayHigh?: number;
  dayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  lastTradeTime?: string;
  currency?: string;
}

type RawQuote = Awaited<ReturnType<typeof yahooFinance.quote>> & Record<string, unknown>;

/** Every getQuote made within a few ms becomes one array request to Yahoo. */
const batchQuote = createBatcher<RawQuote>(async (symbols) => {
  const results = (await track(
    "quote",
    symbols.join(","),
    yahooFinance.quote(symbols, { return: "array" }, { validateResult: false })
  )) as unknown as RawQuote[];
  const bySymbol = new Map<string, RawQuote>();
  for (const q of results ?? []) {
    if (q?.symbol) bySymbol.set(String(q.symbol).toUpperCase(), q);
  }
  return bySymbol;
});

async function getRawQuote(symbol: string, options: CacheOptions = {}): Promise<RawQuote | null> {
  const upper = symbol.toUpperCase();
  return cached<RawQuote>(
    `y:q:${upper}`,
    QUOTE_TTL,
    async () => {
      const q = await batchQuote(upper);
      return q && q.regularMarketPrice != null ? q : null;
    },
    { maxStaleMs: QUOTE_MAX_STALE, ...options }
  );
}

export async function getQuote(
  symbol: string,
  includeRange = false,
  options: CacheOptions = {}
): Promise<StockQuote | QuoteWithRange | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote: any = await getRawQuote(symbol, options);

    if (!quote || quote.regularMarketPrice === undefined) {
      return null;
    }

    const baseQuote: StockQuote = {
      symbol: quote.symbol,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange ?? 0,
      changePercent: quote.regularMarketChangePercent ?? 0,
      volume: quote.regularMarketVolume ?? 0,
      latestTradingDay: quote.regularMarketTime
        ? new Date(quote.regularMarketTime).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      quoteType: quote.quoteType,
      extendedHours: extractExtendedHours(quote),
    };

    if (includeRange) {
      return {
        ...baseQuote,
        shortName: quote.shortName,
        dayHigh: quote.regularMarketDayHigh,
        dayLow: quote.regularMarketDayLow,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        lastTradeTime: quote.regularMarketTime
          ? new Date(quote.regularMarketTime).toISOString()
          : undefined,
        currency: quote.currency,
      };
    }

    return baseQuote;
  } catch {
    return null;
  }
}

/**
 * The exchange-local trading day of a daily bar. Yahoo stamps a daily bar at
 * the session open as a UTC instant (14:30Z for New York and Toronto, 23:00Z
 * the previous day for Sydney), so the instant's UTC date is not always the
 * session's date; shifting by the exchange's UTC offset first always is.
 */
export function barDay(date: Date, gmtOffsetSeconds: number): string {
  return new Date(date.getTime() + gmtOffsetSeconds * 1000).toISOString().slice(0, 10);
}

export interface DailyHistory {
  bars: DailyBar[];
  splits: Split[];
  /** Cash dividends per share, on their ex-dividend day. */
  dividends: { day: string; amount: number }[];
}

interface StoredHistory extends DailyHistory {
  /** The earliest day this series was requested from. */
  from: string;
}

/** At least this much history is fetched, so one series serves every caller. */
function fiveYearsAgo(): string {
  return addDays(addMonths(new Date().toISOString().slice(0, 10), -60), -10);
}

async function fetchHistory(symbol: string, from: string): Promise<DailyHistory | null> {
  try {
    const chart = await track(
      "chart",
      symbol,
      yahooFinance.chart(symbol, { period1: from, period2: new Date(), interval: "1d", events: "div|split" })
    );
    const offset = chart?.meta?.gmtoffset ?? 0;
    const bars: DailyBar[] = (chart?.quotes ?? [])
      .filter((q) => q.date && q.close != null && Number.isFinite(q.close) && q.close > 0)
      .map((q) => ({ day: barDay(q.date, offset), close: q.close as number }));
    if (bars.length === 0) return null;
    const splits: Split[] = (chart?.events?.splits ?? [])
      .filter((s) => s.numerator > 0 && s.denominator > 0)
      .map((s) => ({ day: barDay(new Date(s.date), offset), ratio: s.numerator / s.denominator }));
    const dividends = (chart?.events?.dividends ?? [])
      .filter((d) => d.amount > 0)
      .map((d) => ({ day: barDay(new Date(d.date), offset), amount: d.amount }));
    return { bars, splits, dividends };
  } catch {
    return null;
  }
}

/** Merge a recent fetch onto a stored series, replacing the overlapping days. */
export function mergeHistory(stored: DailyHistory, recent: DailyHistory): DailyHistory {
  const firstNew = recent.bars[0]?.day ?? "9999-12-31";
  const byDay = <T extends { day: string }>(older: T[], newer: T[]) => {
    const seen = new Set(newer.map((x) => `${x.day}`));
    return [...older.filter((x) => x.day < firstNew && !seen.has(x.day)), ...newer].sort((a, b) =>
      a.day < b.day ? -1 : a.day > b.day ? 1 : 0
    );
  };
  return {
    bars: byDay(stored.bars, recent.bars),
    splits: byDay(stored.splits, recent.splits),
    dividends: byDay(stored.dividends, recent.dividends),
  };
}

/**
 * Daily closes from `from` to now, keyed by exchange-local trading day, plus
 * the splits and dividends in that window. Closes are split-adjusted into
 * today's share units (see `splitFactorAfter`). Returns null on failure,
 * never an empty history, so a caller cannot mistake an outage for "no price".
 *
 * One series per symbol is kept (at least five years) and topped up with the
 * last couple of weeks at most hourly, rather than re-downloading years of
 * bars for every caller. A new split rewrites Yahoo's adjusted history, so it
 * triggers a full refetch.
 */
export async function getDailyHistory(symbol: string, from: string): Promise<DailyHistory | null> {
  const upper = symbol.toUpperCase();
  const floor = from < fiveYearsAgo() ? from : fiveYearsAgo();
  const stored = await cached<StoredHistory>(`y:h:${upper}`, HISTORY_TTL, async (previous) => {
    const prev = previous?.value;
    if (prev && prev.from <= floor && prev.bars.length > 0) {
      const lastDay = prev.bars[prev.bars.length - 1].day;
      const recent = await fetchHistory(upper, addDays(lastDay, -14));
      if (!recent) return null;
      const knownSplits = new Set(prev.splits.map((s) => s.day));
      if (!recent.splits.some((s) => !knownSplits.has(s.day))) {
        return { from: prev.from, ...mergeHistory(prev, recent) };
      }
    }
    const full = await fetchHistory(upper, floor);
    return full ? { from: floor, ...full } : null;
  });
  // A cached series that doesn't reach back far enough (an older, shorter
  // request) is refetched on its next expiry; until then it serves what it has.
  if (!stored) return null;
  return {
    bars: stored.bars.filter((b) => b.day >= from),
    splits: stored.splits,
    dividends: stored.dividends ?? [],
  };
}

export type TimeSeriesInterval = "5m" | "15m" | "30m" | "1h" | "1d" | "1wk";

type TimeSeriesPeriod = "1d" | "5d" | "1mo" | "3mo" | "1y" | "2y" | "3y" | "5y" | "10y";

export async function getTimeSeries(
  symbol: string,
  period: TimeSeriesPeriod = "3mo",
  interval: TimeSeriesInterval = "1d"
): Promise<StockTimeSeries[]> {
  const intraday = interval !== "1d" && interval !== "1wk";
  const series = await cached<StockTimeSeries[]>(
    `y:ts:${symbol.toUpperCase()}:${period}:${interval}`,
    intraday ? 5 * MINUTE : HOUR,
    async () => {
      const rows = await fetchTimeSeries(symbol, period, interval);
      return rows.length > 0 ? rows : null;
    }
  );
  return series ?? [];
}

async function fetchTimeSeries(
  symbol: string,
  period: TimeSeriesPeriod,
  interval: TimeSeriesInterval
): Promise<StockTimeSeries[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case "1d":
        startDate.setDate(startDate.getDate() - 1);
        break;
      case "5d":
        startDate.setDate(startDate.getDate() - 5);
        break;
      case "1mo":
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case "3mo":
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case "1y":
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case "2y":
        startDate.setFullYear(startDate.getFullYear() - 2);
        break;
      case "3y":
        startDate.setFullYear(startDate.getFullYear() - 3);
        break;
      case "5y":
        startDate.setFullYear(startDate.getFullYear() - 5);
        break;
      case "10y":
        startDate.setFullYear(startDate.getFullYear() - 10);
        break;
    }

    const result = await track(
      "chart",
      symbol,
      yahooFinance.chart(symbol, { period1: startDate, period2: endDate, interval })
    );

    if (!result || !result.quotes) {
      return [];
    }

    return result.quotes
      .filter((q) => q.date && q.close !== null)
      .map((q) => ({
        // For intraday, include full ISO timestamp; for daily/weekly, just the date
        date: interval === "1d" || interval === "1wk"
          ? q.date.toISOString().split("T")[0]
          : q.date.toISOString(),
        open: q.open ?? 0,
        high: q.high ?? 0,
        low: q.low ?? 0,
        close: q.close ?? 0,
        volume: q.volume ?? 0,
      }));
  } catch {
    return [];
  }
}

export interface InsiderInfo {
  insidersPercentHeld?: number;
  netBuyCount6mo?: number;
  netSellCount6mo?: number;
  netInsiderShares6mo?: number;
  lastInsiderName?: string;
  lastInsiderType?: string;
  lastInsiderDate?: string;
}

type InsiderSummary = Awaited<ReturnType<typeof fetchInsiderSummary>>;

function fetchInsiderSummary(symbol: string) {
  return track(
    "summary",
    symbol,
    yahooFinance.quoteSummary(symbol, {
      modules: ["netSharePurchaseActivity", "majorHoldersBreakdown", "insiderTransactions"],
    })
  );
}

/** One cached insider summary serves both the table row and the details view. */
function getInsiderSummary(symbol: string): Promise<InsiderSummary | null> {
  return cached<InsiderSummary>(`y:ins:${symbol.toUpperCase()}`, INSIDER_TTL, () => fetchInsiderSummary(symbol));
}

export async function getInsiderInfo(symbol: string): Promise<InsiderInfo> {
  try {
    const summary = await getInsiderSummary(symbol);
    if (!summary) return {};

    const netActivity = summary?.netSharePurchaseActivity;
    const holders = summary?.majorHoldersBreakdown;
    const insiderTx = summary?.insiderTransactions;

    // Find most recent Purchase or Sale transaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transactions: any[] = insiderTx?.transactions || [];
    const relevantTx = transactions.find(
      (tx) => tx.text && (tx.text.includes("Purchase") || tx.text.includes("Sale"))
    );

    return {
      insidersPercentHeld: holders?.insidersPercentHeld,
      netBuyCount6mo: netActivity?.buyInfoCount,
      netSellCount6mo: netActivity?.sellInfoCount,
      netInsiderShares6mo: netActivity?.netInfoCount,
      lastInsiderName: relevantTx?.filerName,
      lastInsiderType: relevantTx?.text,
      lastInsiderDate: relevantTx?.startDate
        ? new Date(relevantTx.startDate).toISOString().split("T")[0]
        : undefined,
    };
  } catch {
    return {};
  }
}

export async function getInsiderDetails(symbol: string): Promise<InsiderDetails> {
  try {
    const summary = await getInsiderSummary(symbol);
    if (!summary) return { transactions: [] };

    const netActivity = summary?.netSharePurchaseActivity;
    const holders = summary?.majorHoldersBreakdown;
    const insiderTx = summary?.insiderTransactions;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawTransactions: any[] = insiderTx?.transactions || [];
    const transactions: InsiderTransaction[] = rawTransactions
      .filter((tx) => tx.text && (tx.text.includes("Purchase") || tx.text.includes("Sale")))
      .slice(0, 15)
      .map((tx) => ({
        filerName: tx.filerName || "Unknown",
        filerRelation: tx.filerRelation || "Unknown",
        transactionText: tx.text || "Unknown",
        shares: tx.shares || 0,
        value: tx.value,
        startDate: tx.startDate
          ? new Date(tx.startDate).toISOString().split("T")[0]
          : "",
        ownership: tx.ownership || "Unknown",
      }));

    return {
      insidersPercentHeld: holders?.insidersPercentHeld,
      institutionsPercentHeld: holders?.institutionsPercentHeld,
      institutionsCount: holders?.institutionsCount,
      buyInfoCount: netActivity?.buyInfoCount,
      buyInfoShares: netActivity?.buyInfoShares,
      sellInfoCount: netActivity?.sellInfoCount,
      sellInfoShares: netActivity?.sellInfoShares,
      netInfoShares: netActivity?.netInfoShares,
      totalInsiderShares: netActivity?.totalInsiderShares,
      period: netActivity?.period,
      transactions,
    };
  } catch {
    return { transactions: [] };
  }
}

export async function getInstitutionalOwnership(symbol: string): Promise<InstitutionalOwnership> {
  try {
    const summary = await cached(`y:inst:${symbol.toUpperCase()}`, INSIDER_TTL, () =>
      track(
        "summary",
        symbol,
        yahooFinance.quoteSummary(symbol, {
          modules: ["institutionOwnership", "fundOwnership", "majorHoldersBreakdown"],
        })
      )
    );
    if (!summary) return { institutionHolders: [], fundHolders: [] };

    const holders = summary?.majorHoldersBreakdown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instOwnership: any = summary?.institutionOwnership;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fundOwnershipData: any = summary?.fundOwnership;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapHolder = (item: any): InstitutionalHolder => ({
      organization: item.organization || "Unknown",
      pctHeld: item.pctHeld ?? 0,
      position: item.position ?? 0,
      value: item.value ?? 0,
      pctChange: item.pctChange ?? 0,
      reportDate: item.reportDate
        ? new Date(item.reportDate).toISOString().split("T")[0]
        : undefined,
    });

    const institutionHolders: InstitutionalHolder[] = (instOwnership?.ownershipList || [])
      .slice(0, 10)
      .map(mapHolder);

    const fundHolders: InstitutionalHolder[] = (fundOwnershipData?.ownershipList || [])
      .slice(0, 10)
      .map(mapHolder);

    return {
      institutionsPercentHeld: holders?.institutionsPercentHeld,
      institutionsFloatPercentHeld: holders?.institutionsFloatPercentHeld,
      institutionsCount: holders?.institutionsCount,
      institutionHolders,
      fundHolders,
    };
  } catch {
    return { institutionHolders: [], fundHolders: [] };
  }
}

/** The subset of a Yahoo search news hit that getNews reads. */
interface SearchNewsItem {
  uuid: string;
  title: string;
  publisher?: string;
  link: string;
  providerPublishTime?: string | number | Date;
  type?: string;
  thumbnail?: { resolutions?: { url: string }[] };
  relatedTickers?: string[];
}

export async function getNews(symbol: string, limit = 5): Promise<NewsArticle[]> {
  try {
    const upperSymbol = symbol.toUpperCase();

    // Use search API which provides news with thumbnails
    const result = (await track(
      "search",
      symbol,
      yahooFinance.search(symbol, { newsCount: limit * 3, quotesCount: 0 }, { validateResult: false })
    )) as unknown as { news?: SearchNewsItem[] };

    if (!result || !result.news || result.news.length === 0) {
      return [];
    }

    // Filter to only include articles that actually have this symbol in relatedTickers
    const relevantNews = result.news.filter((item) => {
      if (!item.relatedTickers || item.relatedTickers.length === 0) {
        return false;
      }
      return item.relatedTickers.some(
        (ticker: string) => ticker.toUpperCase() === upperSymbol
      );
    });

    return relevantNews.slice(0, limit).map((item) => ({
      uuid: item.uuid,
      title: item.title,
      publisher: item.publisher || "Unknown",
      link: item.link,
      publishedAt: item.providerPublishTime
        ? new Date(item.providerPublishTime).toISOString()
        : new Date().toISOString(),
      type: item.type || "STORY",
      thumbnail: item.thumbnail?.resolutions?.[0]?.url,
      relatedSymbols: item.relatedTickers || [symbol],
    }));
  } catch {
    return [];
  }
}

export async function getNewsForSymbols(
  symbols: string[],
  limitPerSymbol = 3
): Promise<NewsArticle[]> {
  try {
    const allNews = await Promise.all(
      symbols.map((symbol) => getNews(symbol, limitPerSymbol))
    );

    // Flatten and dedupe by uuid
    const seen = new Set<string>();
    const dedupedNews: NewsArticle[] = [];

    for (const articles of allNews) {
      for (const article of articles) {
        if (!seen.has(article.uuid)) {
          seen.add(article.uuid);
          dedupedNews.push(article);
        }
      }
    }

    // Sort by publishedAt (newest first)
    dedupedNews.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    return dedupedNews;
  } catch {
    return [];
  }
}
