import YahooFinance from "yahoo-finance2";
import { addMonths, closeOnOrBeforeDay, type DailyBar, type Split } from "@/lib/returns";
import { StockQuote, StockTimeSeries, NewsArticle, ExtendedHoursData, MarketState, InsiderTransaction, InsiderDetails, InstitutionalOwnership, InstitutionalHolder } from "@/types";

const yahooFinance = new YahooFinance();

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
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 5);
    startDate.setDate(startDate.getDate() - 7); // Extra buffer for weekends/holidays

    const result = await yahooFinance.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });

    if (!result || !result.quotes || result.quotes.length === 0) {
      return {};
    }

    const quotes = result.quotes.filter((q) => q.date && q.close !== null);
    if (quotes.length === 0) return {};

    const currentPrice = quotes[quotes.length - 1].close!;
    const offset = result.meta?.gmtoffset ?? 0;
    const bars = quotes.map((q) => ({ day: barDay(q.date, offset), close: q.close! }));
    // Anchor on the latest session's date, not the current instant: the
    // baseline must not move with the hour this happens to be computed.
    const latestDay = bars[bars.length - 1].day;
    const priceMonthsAgo = (months: number): number | undefined =>
      closeOnOrBeforeDay(bars, addMonths(latestDay, -months)) ?? undefined;

    // 5D means 5 *trading* days, so index back 5 bars in the daily series
    // rather than 5 calendar days (which is only ~3 trading days).
    const price5D = quotes.length > 5 ? quotes[quotes.length - 1 - 5].close ?? undefined : undefined;
    const price1M = priceMonthsAgo(1);
    const price3M = priceMonthsAgo(3);
    const price1Y = priceMonthsAgo(12);
    const price5Y = priceMonthsAgo(60);

    const calcChange = (oldPrice: number | undefined): number | undefined => {
      if (oldPrice === undefined || oldPrice === 0) return undefined;
      return ((currentPrice - oldPrice) / oldPrice) * 100;
    };

    return {
      change5D: calcChange(price5D),
      change1M: calcChange(price1M),
      change3M: calcChange(price3M),
      change1Y: calcChange(price1Y),
      change5Y: calcChange(price5Y),
    };
  } catch {
    return {};
  }
}

export interface StockDetails {
  // Basic info
  symbol: string;
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

export async function getStockDetails(symbol: string): Promise<StockDetails | null> {
  try {
    const [quote, summary] = await Promise.all([
      yahooFinance.quote(symbol),
      yahooFinance.quoteSummary(symbol, {
        modules: [
          "price",
          "summaryDetail",
          "defaultKeyStatistics",
          "financialData",
          "calendarEvents",
          "summaryProfile",
        ],
      }),
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
      priceToSales: (keyStats as { priceToSalesTrailing12Months?: number } | undefined)?.priceToSalesTrailing12Months,

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
  try {
    const summary = await yahooFinance.quoteSummary(symbol, {
      modules: ["summaryDetail", "calendarEvents", "summaryProfile"],
    });

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
    return {};
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

export async function getQuote(symbol: string, includeRange = false): Promise<StockQuote | QuoteWithRange | null> {
  try {
    const quote = await yahooFinance.quote(symbol);

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
}

/**
 * Daily closes from `from` to now, keyed by exchange-local trading day, plus
 * the splits in that window. Closes are split-adjusted into today's share
 * units (see `splitFactorAfter`). Returns null on failure, never an empty
 * history, so a caller cannot mistake an outage for "no price".
 */
export async function getDailyHistory(symbol: string, from: string): Promise<DailyHistory | null> {
  try {
    const chart = await yahooFinance.chart(symbol, {
      period1: from,
      period2: new Date(),
      interval: "1d",
      events: "split",
    });
    const offset = chart?.meta?.gmtoffset ?? 0;
    const bars: DailyBar[] = (chart?.quotes ?? [])
      .filter((q) => q.date && q.close != null && Number.isFinite(q.close) && q.close > 0)
      .map((q) => ({ day: barDay(q.date, offset), close: q.close as number }));
    if (bars.length === 0) return null;
    const splits: Split[] = (chart?.events?.splits ?? [])
      .filter((s) => s.numerator > 0 && s.denominator > 0)
      .map((s) => ({ day: barDay(new Date(s.date), offset), ratio: s.numerator / s.denominator }));
    return { bars, splits };
  } catch {
    return null;
  }
}

export type TimeSeriesInterval = "5m" | "15m" | "30m" | "1h" | "1d" | "1wk";

export async function getTimeSeries(
  symbol: string,
  period: "1d" | "5d" | "1mo" | "3mo" | "1y" | "2y" | "3y" | "5y" | "10y" = "3mo",
  interval: TimeSeriesInterval = "1d"
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

    const result = await yahooFinance.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: interval,
    });

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

export async function getInsiderInfo(symbol: string): Promise<InsiderInfo> {
  try {
    const summary = await yahooFinance.quoteSummary(symbol, {
      modules: ["netSharePurchaseActivity", "majorHoldersBreakdown", "insiderTransactions"],
    });

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
    const summary = await yahooFinance.quoteSummary(symbol, {
      modules: ["netSharePurchaseActivity", "majorHoldersBreakdown", "insiderTransactions"],
    });

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
    const summary = await yahooFinance.quoteSummary(symbol, {
      modules: ["institutionOwnership", "fundOwnership", "majorHoldersBreakdown"],
    });

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
    const result = (await yahooFinance.search(symbol, {
      newsCount: limit * 3,
      quotesCount: 0,
    }, { validateResult: false })) as unknown as { news?: SearchNewsItem[] };

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
