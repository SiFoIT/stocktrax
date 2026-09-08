import type { MarketRange } from "@/lib/markets/ranges";

// Centralized cache TTL configuration (in milliseconds)
export const CACHE_TTL = {
  /** Daily stock quotes — 1 hour */
  stockQuote: 60 * 60 * 1000,
  /** Intraday stock data — 5 minutes */
  stockIntraday: 5 * 60 * 1000,
  /** Market overview quotes — 5 minutes */
  markets: 5 * 60 * 1000,
  /**
   * Market overview sparkline series, per timeframe. Quotes are cached apart
   * from the series, so a long-lived 1Y line still ends at a fresh price.
   */
  marketSeries: {
    "1D": 5 * 60 * 1000,
    "5D": 5 * 60 * 1000,
    "1M": 15 * 60 * 1000,
    "3M": 60 * 60 * 1000,
    "1Y": 60 * 60 * 1000,
    "5Y": 6 * 60 * 60 * 1000,
  } satisfies Record<MarketRange, number>,
  /** Exchange rates — 5 minutes */
  exchangeRate: 5 * 60 * 1000,
  /** News articles — 15 minutes */
  news: 15 * 60 * 1000,
  /** Portfolio summary dashboard — 5 minutes */
  portfolioSummary: 5 * 60 * 1000,
  /** Insider trading data — 6 hours */
  insider: 6 * 60 * 60 * 1000,
} as const;
