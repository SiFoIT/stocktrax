export type Category = "markets" | "commodities" | "currency" | "crypto";

export interface MarketSymbol {
  symbol: string;
  name: string;
  /**
   * The front-month index future quoted while the cash index is not trading.
   * Only the US indices have one: the TSX contract is not reliably on Yahoo.
   */
  futures?: { symbol: string; label: string };
}

export const MARKET_SYMBOLS: Record<Category, MarketSymbol[]> = {
  markets: [
    // US
    { symbol: "^GSPC", name: "S&P 500", futures: { symbol: "ES=F", label: "Futures" } },
    { symbol: "^DJI", name: "Dow Jones", futures: { symbol: "YM=F", label: "Futures" } },
    // NQ=F tracks the Nasdaq 100, not the Composite this card shows, so it is
    // labelled for what it actually is.
    { symbol: "^IXIC", name: "Nasdaq", futures: { symbol: "NQ=F", label: "NDX futures" } },
    // Canada
    { symbol: "^GSPTSE", name: "S&P/TSX Composite" },
    { symbol: "^VIX", name: "VIX" },
    // Europe
    { symbol: "^FTSE", name: "FTSE 100" },
    { symbol: "^GDAXI", name: "DAX" },
    { symbol: "^FCHI", name: "CAC 40" },
    // Asia
    { symbol: "^N225", name: "Nikkei 225" },
    { symbol: "^HSI", name: "Hang Seng" },
    { symbol: "000001.SS", name: "Shanghai Composite" },
  ],
  commodities: [
    { symbol: "GC=F", name: "Gold" },
    { symbol: "SI=F", name: "Silver" },
    { symbol: "CL=F", name: "Crude Oil" },
  ],
  currency: [
    { symbol: "CAD=X", name: "USD/CAD" },
    { symbol: "CADUSD=X", name: "CAD/USD" },
    { symbol: "EURCAD=X", name: "EUR/CAD" },
    { symbol: "EURUSD=X", name: "EUR/USD" },
    { symbol: "GBPUSD=X", name: "GBP/USD" },
    { symbol: "USDJPY=X", name: "USD/JPY" },
  ],
  crypto: [
    { symbol: "BTC-USD", name: "Bitcoin" },
    { symbol: "ETH-USD", name: "Ethereum" },
    { symbol: "SOL-USD", name: "Solana" },
  ],
};

export const CATEGORY_LABELS: Record<Category, string> = {
  markets: "Markets",
  commodities: "Commodities",
  currency: "Currency",
  crypto: "Crypto",
};

export const CATEGORIES: Category[] = ["markets", "commodities", "currency", "crypto"];

/** The four indices promoted to full cards at the top of the Markets panel. */
export const HEADLINE_SYMBOLS = ["^GSPC", "^GSPTSE", "^IXIC", "^DJI"] as const;
