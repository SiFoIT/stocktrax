import YahooFinance from "yahoo-finance2";
import { StockQuote, StockTimeSeries } from "@/types";

const yahooFinance = new YahooFinance();

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

export async function getTimeSeries(
  symbol: string,
  period: "1mo" | "3mo" | "6mo" | "1y" = "3mo"
): Promise<StockTimeSeries[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case "1mo":
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case "3mo":
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case "6mo":
        startDate.setMonth(startDate.getMonth() - 6);
        break;
      case "1y":
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    const result = await yahooFinance.chart(symbol, {
      period1: startDate,
      period2: endDate,
    });

    if (!result || !result.quotes) {
      console.error("Invalid time series response for symbol:", symbol);
      return [];
    }

    return result.quotes
      .filter((q) => q.date && q.close !== null)
      .map((q) => ({
        date: q.date.toISOString().split("T")[0],
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
