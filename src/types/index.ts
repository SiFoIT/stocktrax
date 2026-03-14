export type MarketState = "REGULAR" | "CLOSED" | "PRE" | "PREPRE" | "POST" | "POSTPOST";

export interface ExtendedHoursData {
  marketState?: MarketState;
  preMarketPrice?: number;
  preMarketChange?: number;
  preMarketChangePercent?: number;
  preMarketTime?: string;
  postMarketPrice?: number;
  postMarketChange?: number;
  postMarketChangePercent?: number;
  postMarketTime?: string;
}

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  latestTradingDay: string;
  quoteType?: string;
  extendedHours?: ExtendedHoursData;
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
  extendedHours?: ExtendedHoursData;
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
  // Insider
  insidersPercentHeld?: number;
  netBuyCount6mo?: number;
  netSellCount6mo?: number;
  netInsiderShares6mo?: number;
  lastInsiderName?: string;
  lastInsiderType?: string;
  lastInsiderDate?: string;
}

export interface InsiderTransaction {
  filerName: string;
  filerRelation: string;
  transactionText: string;
  shares: number;
  value?: number;
  startDate: string;
  ownership: string;
}

export interface InsiderDetails {
  insidersPercentHeld?: number;
  institutionsPercentHeld?: number;
  institutionsCount?: number;
  buyInfoCount?: number;
  buyInfoShares?: number;
  sellInfoCount?: number;
  sellInfoShares?: number;
  netInfoShares?: number;
  totalInsiderShares?: number;
  period?: string;
  transactions: InsiderTransaction[];
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
  extendedHours?: ExtendedHoursData;
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

export interface InstitutionalHolder {
  organization: string;
  pctHeld: number;
  position: number;
  value: number;
  pctChange: number;
  reportDate?: string;
}

export interface InstitutionalOwnership {
  institutionsPercentHeld?: number;
  institutionsFloatPercentHeld?: number;
  institutionsCount?: number;
  institutionHolders: InstitutionalHolder[];
  fundHolders: InstitutionalHolder[];
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
  periodReturns?: Record<string, { amount: number; percent: number }>;
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
    totalDividends?: number;
    totalCash?: number;
    periodReturns?: Record<string, { amount: number; percent: number }>;
  };
  breakdowns: {
    assetType: BreakdownItem[];
    sector: BreakdownItem[];
    currency: BreakdownItem[];
    topHoldings: BreakdownItem[];
  };
}

export type AlertScope = "watchlist" | "holding" | "market";
export type AlertMetric =
  | "daily_change_percent"
  | "last_price"
  | "price_vs_anchor"
  | "holding_gain_percent";
export type AlertOperator = "gte" | "lte";
export type AlertResetStrategy = "manual" | "recovery" | "cooldown" | "baseline" | "end_of_day";

export interface AlertRuleDTO {
  id: number;
  scope: AlertScope;
  watchlistItemId?: number | null;
  holdingId?: number | null;
  symbol: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  resetStrategy: AlertResetStrategy;
  anchorValue?: number | null;
  cooldownMinutes?: number | null;
  baselineValue?: number | null;
  needsRecovery: boolean;
  isMuted: boolean;
  cooldownUntil?: string | null;
  lastTriggeredAt?: string | null;
  lastResetAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertHistoryEntry {
  id: number;
  ruleId: number;
  scope: AlertScope;
  symbol: string;
  message: string;
  metricValue?: number | null;
  price?: number | null;
  changePercent?: number | null;
  triggeredAt: string;
  acknowledgedAt?: string | null;
  resetStrategy: AlertResetStrategy;
  operator: AlertOperator;
  threshold: number;
}

export type TriggeredAlertSummary = AlertHistoryEntry;

export interface StockTransactionRow {
  kind: "stock";
  id: number;
  holdingId: number;
  type: "buy" | "sell" | "dividend" | "transfer_in";
  shares: number;
  price: number;
  date: string;
  symbol: string;
  currency: string;
}

export interface CashTransactionRow {
  kind: "cash";
  id: number;
  portfolioId: number;
  type: "contribution" | "deposit" | "refund" | "referral" | "transfer_in" | "transfer_out" | "fx_conversion";
  description: string;
  amount: number;
  date: string;
  currency: string;
}

export type UnifiedTransaction = StockTransactionRow | CashTransactionRow;
