export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  latestTradingDay: string;
}

export interface StockTimeSeries {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HoldingWithQuote {
  id: number;
  portfolioId: number;
  symbol: string;
  shares: number;
  avgCost: number;
  currency: string;
  currentPrice?: number;
  marketValue?: number;
  gainLoss?: number;
  gainLossPercent?: number;
}

export interface WatchlistItemWithQuote {
  id: number;
  watchlistId: number;
  symbol: string;
  addedAt: Date;
  price?: number;
  change?: number;
  changePercent?: number;
  change5D?: number;
  change1M?: number;
  change3M?: number;
  change1Y?: number;
  // Price range fields
  dayHigh?: number;
  dayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  // Dividend fields
  dividendRate?: number;
  dividendYield?: number;
  exDividendDate?: string;
  dividendDate?: string;
  payoutRatio?: number;
  trailingAnnualDividendYield?: number;
  fiveYearAvgDividendYield?: number;
}

export interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  sparklineData: number[];
}
