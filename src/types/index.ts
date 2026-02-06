export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  latestTradingDay: string;
  quoteType?: string;
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
  shortName?: string;
  shares: number;
  avgCost: number;
  currency: string;
  currentPrice?: number;
  marketValue?: number;
  gainLoss?: number;
  gainLossPercent?: number;
  // Price change fields (same as WatchlistItemWithQuote)
  change?: number;
  changePercent?: number;
  lastTradeTime?: string;
  change5D?: number;
  change1M?: number;
  change3M?: number;
  change1Y?: number;
  change5Y?: number;
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
  // Company info
  sector?: string;
  // Volume fields
  volume?: number;
  avgVolume?: number;
}

export interface WatchlistItemWithQuote {
  id: number;
  watchlistId: number;
  symbol: string;
  addedAt: Date;
  price?: number;
  change?: number;
  changePercent?: number;
  currency?: string;
  lastTradeTime?: string;
  change5D?: number;
  change1M?: number;
  change3M?: number;
  change1Y?: number;
  change5Y?: number;
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
  // Company info
  sector?: string;
  // Volume fields
  volume?: number;
  avgVolume?: number;
}

export interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  sparklineData: number[];
}

export interface TransactionWithSymbol {
  id: number;
  holdingId: number;
  type: "buy" | "sell" | "dividend" | "transfer_in";
  shares: number;
  price: number;
  date: string;
  symbol: string;
  currency: string;
}

export interface NewsArticle {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
  type: string;
  thumbnail?: string;
  relatedSymbols: string[];
}

export interface PortfolioSummary {
  id: number;
  name: string;
  currency: string;
  marketValue: number;
  costBasis: number;
  gainLoss: number;
  gainLossPercent: number;
  todayReturn: number;
  todayReturnPercent: number;
  percentOfTotal: number;
  yearlyReturns: Record<string, { amount: number; percent: number }>;
  sinceInception: { amount: number; percent: number };
}

export interface BreakdownItem {
  name: string;
  value: number;
}

export interface PortfolioDashboardData {
  portfolios: PortfolioSummary[];
  totals: {
    marketValue: number;
    costBasis: number;
    gainLoss: number;
    gainLossPercent: number;
    todayReturn: number;
    todayReturnPercent: number;
    cagr: number;
  };
  breakdowns: {
    assetType: BreakdownItem[];
    sector: BreakdownItem[];
    currency: BreakdownItem[];
    topHoldings: BreakdownItem[];
  };
}
