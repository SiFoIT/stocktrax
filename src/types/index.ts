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

export interface QuoteFields {
  change?: number;
  changePercent?: number;
  lastTradeTime?: string;
  shortName?: string;
  // Historical changes
  change5D?: number;
  change1M?: number;
  change3M?: number;
  change1Y?: number;
  change5Y?: number;
  // Price range
  dayHigh?: number;
  dayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  // Dividend
  dividendRate?: number;
  dividendYield?: number;
  exDividendDate?: string;
  dividendDate?: string;
  payoutRatio?: number;
  trailingAnnualDividendYield?: number;
  fiveYearAvgDividendYield?: number;
  // Company info
  sector?: string;
  // Volume
  volume?: number;
  avgVolume?: number;
}

export interface HoldingWithQuote extends QuoteFields {
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
  quoteType?: string;
}

export interface WatchlistItemWithQuote extends QuoteFields {
  id: number;
  watchlistId: number;
  symbol: string;
  addedAt: Date;
  price?: number;
  currency?: string;
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
  createdAt: string;
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
    earliestTransactionDate: string;
  };
  breakdowns: {
    assetType: BreakdownItem[];
    sector: BreakdownItem[];
    currency: BreakdownItem[];
    topHoldings: BreakdownItem[];
  };
}
