import { StockDetails, HistoricalChanges } from "@/lib/api/yahoo-finance";

export type ScreenOperator = "gte" | "lte" | "gt" | "lt" | "eq" | "between";

export const SCREEN_OPERATORS: { value: ScreenOperator; label: string }[] = [
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "eq", label: "=" },
  { value: "between", label: "between" },
];

export interface ScreenRule {
  metric: string;
  operator: ScreenOperator;
  value: number;
  valueTo?: number;
}

export type MetricCategory =
  | "Price"
  | "Moving Averages"
  | "Valuation"
  | "Dividends"
  | "Performance"
  | "Profitability"
  | "Risk"
  | "Analyst";

export interface MetricDef {
  label: string;
  unit: string;
  category: MetricCategory;
  tooltip: string;
  compute: (details: StockDetails, changes?: HistoricalChanges) => number | undefined;
}

export const METRICS: Record<string, MetricDef> = {
  pct_off_52w_high: {
    label: "% Off 52-Week High",
    unit: "%",
    category: "Price",
    tooltip: "How far the price is below its 52-week high (negative = below)",
    compute: (d) => {
      if (d.price == null || d.fiftyTwoWeekHigh == null || d.fiftyTwoWeekHigh === 0) return undefined;
      return ((d.price - d.fiftyTwoWeekHigh) / d.fiftyTwoWeekHigh) * 100;
    },
  },
  pct_above_52w_low: {
    label: "% Above 52-Week Low",
    unit: "%",
    category: "Price",
    tooltip: "How far the price is above its 52-week low",
    compute: (d) => {
      if (d.price == null || d.fiftyTwoWeekLow == null || d.fiftyTwoWeekLow === 0) return undefined;
      return ((d.price - d.fiftyTwoWeekLow) / d.fiftyTwoWeekLow) * 100;
    },
  },
  price_vs_50d_ma: {
    label: "Price vs 50-Day MA %",
    unit: "%",
    category: "Moving Averages",
    tooltip: "Percentage difference between current price and 50-day moving average",
    compute: (d) => {
      if (d.price == null || d.fiftyDayAverage == null || d.fiftyDayAverage === 0) return undefined;
      return ((d.price - d.fiftyDayAverage) / d.fiftyDayAverage) * 100;
    },
  },
  price_vs_200d_ma: {
    label: "Price vs 200-Day MA %",
    unit: "%",
    category: "Moving Averages",
    tooltip: "Percentage difference between current price and 200-day moving average",
    compute: (d) => {
      if (d.price == null || d.twoHundredDayAverage == null || d.twoHundredDayAverage === 0) return undefined;
      return ((d.price - d.twoHundredDayAverage) / d.twoHundredDayAverage) * 100;
    },
  },
  daily_change_percent: {
    label: "Daily Change %",
    unit: "%",
    category: "Price",
    tooltip: "Today's price change percentage",
    compute: (d) => d.changePercent,
  },
  change_5d: {
    label: "5-Day Change %",
    unit: "%",
    category: "Performance",
    tooltip: "Price change over the last 5 trading days",
    compute: (_d, c) => c?.change5D,
  },
  change_1m: {
    label: "1-Month Change %",
    unit: "%",
    category: "Performance",
    tooltip: "Price change over the last month",
    compute: (_d, c) => c?.change1M,
  },
  change_3m: {
    label: "3-Month Change %",
    unit: "%",
    category: "Performance",
    tooltip: "Price change over the last 3 months",
    compute: (_d, c) => c?.change3M,
  },
  change_1y: {
    label: "1-Year Change %",
    unit: "%",
    category: "Performance",
    tooltip: "Price change over the last year",
    compute: (_d, c) => c?.change1Y,
  },
  trailing_pe: {
    label: "Trailing P/E",
    unit: "x",
    category: "Valuation",
    tooltip: "Price-to-earnings ratio based on trailing 12-month earnings",
    compute: (d) => d.trailingPE,
  },
  forward_pe: {
    label: "Forward P/E",
    unit: "x",
    category: "Valuation",
    tooltip: "Price-to-earnings ratio based on forward earnings estimates",
    compute: (d) => d.forwardPE,
  },
  price_to_book: {
    label: "Price/Book",
    unit: "x",
    category: "Valuation",
    tooltip: "Price-to-book ratio",
    compute: (d) => d.priceToBook,
  },
  price_to_sales: {
    label: "Price/Sales",
    unit: "x",
    category: "Valuation",
    tooltip: "Price-to-sales ratio (trailing 12 months)",
    compute: (d) => d.priceToSales,
  },
  dividend_yield: {
    label: "Dividend Yield %",
    unit: "%",
    category: "Dividends",
    tooltip: "Annual dividend yield as a percentage",
    compute: (d) => (d.dividendYield != null ? d.dividendYield * 100 : undefined),
  },
  payout_ratio: {
    label: "Payout Ratio %",
    unit: "%",
    category: "Dividends",
    tooltip: "Percentage of earnings paid as dividends",
    compute: (d) => (d.payoutRatio != null ? d.payoutRatio * 100 : undefined),
  },
  market_cap: {
    label: "Market Cap",
    unit: "$",
    category: "Valuation",
    tooltip: "Total market capitalization",
    compute: (d) => d.marketCap,
  },
  beta: {
    label: "Beta",
    unit: "",
    category: "Risk",
    tooltip: "Measure of stock volatility relative to the market",
    compute: (d) => d.beta,
  },
  profit_margin: {
    label: "Profit Margin %",
    unit: "%",
    category: "Profitability",
    tooltip: "Net profit margin",
    compute: (d) => (d.profitMargin != null ? d.profitMargin * 100 : undefined),
  },
  return_on_equity: {
    label: "ROE %",
    unit: "%",
    category: "Profitability",
    tooltip: "Return on equity",
    compute: (d) => (d.returnOnEquity != null ? d.returnOnEquity * 100 : undefined),
  },
  debt_to_equity: {
    label: "Debt/Equity",
    unit: "x",
    category: "Risk",
    tooltip: "Debt-to-equity ratio",
    compute: (d) => d.debtToEquity,
  },
  recommendation_mean: {
    label: "Analyst Rating (1-5)",
    unit: "",
    category: "Analyst",
    tooltip: "Mean analyst recommendation (1 = Strong Buy, 5 = Sell)",
    compute: (d) => d.recommendationMean,
  },
  upside_to_target: {
    label: "Upside to Target %",
    unit: "%",
    category: "Analyst",
    tooltip: "Percentage upside to mean analyst target price",
    compute: (d) => {
      if (d.price == null || d.targetMeanPrice == null || d.price === 0) return undefined;
      return ((d.targetMeanPrice - d.price) / d.price) * 100;
    },
  },
};

export const PERFORMANCE_METRICS = new Set(["change_5d", "change_1m", "change_3m", "change_1y"]);

export function evaluateRule(
  value: number | undefined,
  operator: ScreenOperator,
  threshold: number,
  thresholdTo?: number
): boolean {
  if (value === undefined || value === null) return false;
  switch (operator) {
    case "gte": return value >= threshold;
    case "lte": return value <= threshold;
    case "gt": return value > threshold;
    case "lt": return value < threshold;
    case "eq": return value === threshold;
    case "between": return thresholdTo != null && value >= threshold && value <= thresholdTo;
    default: return false;
  }
}

export function getMetricsByCategory(): Record<MetricCategory, { key: string; def: MetricDef }[]> {
  const grouped: Record<string, { key: string; def: MetricDef }[]> = {};
  for (const [key, def] of Object.entries(METRICS)) {
    if (!grouped[def.category]) grouped[def.category] = [];
    grouped[def.category].push({ key, def });
  }
  return grouped as Record<MetricCategory, { key: string; def: MetricDef }[]>;
}
