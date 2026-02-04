export type Category = "markets" | "currency" | "crypto";

export interface MarketSymbol {
  symbol: string;
  name: string;
}

export const MARKET_SYMBOLS: Record<Category, MarketSymbol[]> = {
  markets: [
    // US
    { symbol: "^GSPC", name: "S&P 500" },
    { symbol: "^DJI", name: "Dow Jones" },
    { symbol: "^IXIC", name: "Nasdaq" },
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
  currency: "Currency",
  crypto: "Crypto",
};

export const CATEGORIES: Category[] = ["markets", "currency", "crypto"];
