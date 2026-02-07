// Centralized cache TTL configuration (in milliseconds)
export const CACHE_TTL = {
  /** Daily stock quotes — 1 hour */
  stockQuote: 60 * 60 * 1000,
  /** Intraday stock data — 5 minutes */
  stockIntraday: 5 * 60 * 1000,
  /** Market overview data — 5 minutes */
  markets: 5 * 60 * 1000,
  /** Exchange rates — 5 minutes */
  exchangeRate: 5 * 60 * 1000,
  /** News articles — 15 minutes */
  news: 15 * 60 * 1000,
  /** Portfolio summary dashboard — 5 minutes */
  portfolioSummary: 5 * 60 * 1000,
} as const;
