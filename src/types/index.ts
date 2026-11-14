import type { Category as MarketCategory, MarketSections } from "@/lib/markets/symbols";

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

/**
 * A front-month index future, shown on a headline card while its cash index is
 * closed. Only `changePercent` is rendered: the contract trades at a basis to
 * the index, so its price level under the index's close reads as an error.
 */
export interface FuturesQuote {
  symbol: string;
  /** The contract's name, e.g. "E-mini S&P 500". Shown only in the tooltip. */
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketState?: MarketState;
  lastTradeTime?: string;
}

export interface MarketData {
  symbol: string;
  name: string;
  /** Short label after the code on the table sub-line, e.g. "CAD per USD". */
  short?: string;
  /** Full sentence for the name's tooltip and the section picker. */
  description?: string;
  price: number;
  /** Daily change. Alerts and the glance tiles always read these two. */
  change: number;
  changePercent: number;
  /**
   * Change over the timeframe the Markets toolbar has selected, which is what
   * the cards and rows print. Equal to the daily change on 1D.
   */
  rangeChange: number;
  rangeChangePercent: number;
  /** Covers the same window as `rangeChange`, and ends at `price`. */
  sparklineData: number[];
  /**
   * True when Yahoo returned no usable quote. `price` and the changes are
   * then placeholders (0) and must be shown as a dash, never as numbers.
   */
  unavailable?: boolean;
  /** Low and high of the same window, widened to include the live price. */
  rangeLow?: number;
  rangeHigh?: number;
  extendedHours?: ExtendedHoursData;
  futures?: FuturesQuote;
}

/**
 * The Markets page payload. `hidden` carries symbols that only an alert rule
 * still references, so those rules keep evaluating after their row is removed;
 * nothing renders them.
 */
export type MarketsResponse = Record<MarketCategory, MarketData[]> & {
  hidden: MarketData[];
  sections: MarketSections;
};

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
  /**
   * Total return since the first transaction: market value + sale proceeds +
   * dividends − money put in. Percent is over the money put in (buys and
   * transfers in), so it stays meaningful after large sells.
   */
  /** Null when a holding has no quote: the figure would read it as a total loss. */
  sinceInception: { amount: number; percent: number } | null;
  /**
   * Money-weighted annualized return (XIRR) over the portfolio's cash flows,
   * in percent. Null when it can't be computed (a quote missing, or under a
   * month of history).
   */
  cagr: number | null;
  periodReturns?: Record<string, { amount: number; percent: number }>;
  /**
   * Return since the close of the Friday before the latest completed Mon–Fri
   * week (the weekly digest's baseline), net of trades. Absent when a price
   * needed for it is missing.
   */
  weekReturn?: { amount: number; percent: number };
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
    /** Sum of the portfolios' sinceInception: the Total row of the Inception column. */
    sinceInception: { amount: number; percent: number } | null;
    /** Money-weighted annualized return (XIRR) across every portfolio, in percent; null when unavailable. */
    cagr: number | null;
    earliestTransactionDate: string;
    totalDividends?: number;
    totalCash?: number;
    periodReturns?: Record<string, { amount: number; percent: number }>;
    /** Sum across portfolios, present only when every portfolio has that year. */
    yearlyReturns?: Record<string, { amount: number; percent: number }>;
    /** Sum of the portfolios' weekReturn, present only when every portfolio has one. */
    weekReturn?: { amount: number; percent: number };
  };
  breakdowns: {
    assetType: BreakdownItem[];
    sector: BreakdownItem[];
    currency: BreakdownItem[];
    topHoldings: BreakdownItem[];
  };
  /**
   * Present when the figures are incomplete: these symbols had no quote (they
   * are left out of value and their portfolio's returns are omitted), or the
   * exchange rate is the last known one rather than live.
   */
  missing?: { symbols: string[]; exchangeRate: boolean };
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

/** Money-weighted returns, in percent; null when there isn't enough history. */
export interface PerformanceReturns {
  /** Since the last close of the previous year, not annualized. */
  ytd: number | null;
  /** Over the last 12 months, not annualized. */
  oneYear: number | null;
  /** Since the first deposit, annualized (XIRR). */
  annualized: number | null;
}

export interface PerformanceData {
  /** Last session in the series. */
  asOf: string;
  /** First day with any activity. */
  since: string;
  /**
   * One point per session, in CAD: account value (holdings + cash), external
   * money contributed so far, and what the same deposits would be worth in
   * each benchmark (null when its history is unavailable).
   */
  points: { day: string; value: number; contributed: number; benchmarks: Record<string, number | null> }[];
  returns: {
    portfolio: PerformanceReturns;
    benchmarks: Record<string, PerformanceReturns | null>;
  };
  benchmarks: { symbol: string; label: string }[];
  /** Symbols whose price history was unavailable (valued at their last trade price). */
  missing: string[];
  /** True when USD/CAD history was unavailable and today's rate was used throughout. */
  fxStale: boolean;
}
