export type Region = "canada" | "us" | "europe" | "asia" | "crypto";

export interface MarketSymbol {
  symbol: string;
  name: string;
}

export const MARKET_SYMBOLS: Record<Region, MarketSymbol[]> = {
  canada: [
    { symbol: "^GSPTSE", name: "S&P/TSX Composite" },
    { symbol: "CAD=X", name: "USD/CAD" },
    { symbol: "CADUSD=X", name: "CAD/USD" },
    { symbol: "EURCAD=X", name: "EUR/CAD" },
  ],
  us: [
    { symbol: "^GSPC", name: "S&P 500" },
    { symbol: "^DJI", name: "Dow Jones" },
    { symbol: "^IXIC", name: "Nasdaq" },
    { symbol: "^VIX", name: "VIX" },
  ],
  europe: [
    { symbol: "^FTSE", name: "FTSE 100" },
    { symbol: "^GDAXI", name: "DAX" },
    { symbol: "^FCHI", name: "CAC 40" },
  ],
  asia: [
    { symbol: "^N225", name: "Nikkei 225" },
    { symbol: "^HSI", name: "Hang Seng" },
    { symbol: "000001.SS", name: "Shanghai Composite" },
  ],
  crypto: [
    { symbol: "BTC-USD", name: "Bitcoin" },
    { symbol: "ETH-USD", name: "Ethereum" },
    { symbol: "SOL-USD", name: "Solana" },
  ],
};

export const REGION_LABELS: Record<Region, string> = {
  canada: "Canada",
  us: "US",
  europe: "Europe",
  asia: "Asia",
  crypto: "Crypto",
};
