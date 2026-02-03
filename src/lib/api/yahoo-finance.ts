import YahooFinance from "yahoo-finance2";
import { StockQuote, StockTimeSeries } from "@/types";

const yahooFinance = new YahooFinance();

export interface HistoricalChanges {
  change5D?: number;
  change1M?: number;
  change3M?: number;
  change1Y?: number;
}

export async function getHistoricalChanges(symbol: string): Promise<HistoricalChanges> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);
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
    const now = new Date();

    const findPriceAtDaysAgo = (daysAgo: number): number | undefined => {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() - daysAgo);

      // Find the closest quote on or before target date
      for (let i = quotes.length - 1; i >= 0; i--) {
        if (quotes[i].date <= targetDate) {
          return quotes[i].close!;
        }
      }
      return undefined;
    };

    const price5D = findPriceAtDaysAgo(5);
    const price1M = findPriceAtDaysAgo(30);
    const price3M = findPriceAtDaysAgo(90);
    const price1Y = findPriceAtDaysAgo(365);

    const calcChange = (oldPrice: number | undefined): number | undefined => {
      if (oldPrice === undefined || oldPrice === 0) return undefined;
      return ((currentPrice - oldPrice) / oldPrice) * 100;
    };

    return {
      change5D: calcChange(price5D),
      change1M: calcChange(price1M),
      change3M: calcChange(price3M),
      change1Y: calcChange(price1Y),
    };
  } catch (error) {
    console.error("Error fetching historical changes:", error);
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
      dividendRate: detail?.dividendRate,
      dividendYield: detail?.dividendYield,
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
      debtToEquity: financial?.debtToEquity,
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
    };
  } catch (error) {
    console.error("Error fetching stock details:", error);
    return null;
  }
}

export async function getQuote(symbol: string): Promise<StockQuote | null> {
  try {
    const quote = await yahooFinance.quote(symbol);

    if (!quote || quote.regularMarketPrice === undefined) {
      console.error("Invalid response from Yahoo Finance for symbol:", symbol);
      return null;
    }

    return {
      symbol: quote.symbol,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange ?? 0,
      changePercent: quote.regularMarketChangePercent ?? 0,
      volume: quote.regularMarketVolume ?? 0,
      latestTradingDay: quote.regularMarketTime
        ? new Date(quote.regularMarketTime).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
    };
  } catch (error) {
    console.error("Error fetching quote:", error);
    return null;
  }
}

export type TimeSeriesInterval = "5m" | "15m" | "1h" | "1d";

export async function getTimeSeries(
  symbol: string,
  period: "1d" | "5d" | "1mo" | "3mo" | "1y" = "3mo",
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
    }

    const result = await yahooFinance.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: interval,
    });

    if (!result || !result.quotes) {
      console.error("Invalid time series response for symbol:", symbol);
      return [];
    }

    return result.quotes
      .filter((q) => q.date && q.close !== null)
      .map((q) => ({
        // For intraday, include full ISO timestamp; for daily, just the date
        date: interval === "1d"
          ? q.date.toISOString().split("T")[0]
          : q.date.toISOString(),
        open: q.open ?? 0,
        high: q.high ?? 0,
        low: q.low ?? 0,
        close: q.close ?? 0,
        volume: q.volume ?? 0,
      }));
  } catch (error) {
    console.error("Error fetching time series:", error);
    return [];
  }
}
