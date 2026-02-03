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
