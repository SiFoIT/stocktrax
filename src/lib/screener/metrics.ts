import { StockDetails, HistoricalChanges } from "@/lib/api/yahoo-finance";

export type ScreenOperator = "gte" | "lte" | "gt" | "lt" | "between";

export const SCREEN_OPERATORS: { value: ScreenOperator; label: string }[] = [
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
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

/** Unit shown beside the value box and in the results column header. */
export type MetricUnit = "%" | "x" | "$B" | "";

export interface MetricDef {
  /** Plain label with no unit; the unit is shown separately. */
  label: string;
  unit: MetricUnit;
  category: MetricCategory;
  tooltip: string;
  /**
   * Directional metrics (changes, price vs average, upside) are shown with a
   * sign and coloured like Today's Change. Distances and ratios are not.
   */
  signed: boolean;
  /** Operator and value a fresh rule starts with, so a new rule does something. */
  defaultRule: { operator: ScreenOperator; value: number; valueTo?: number };
  compute: (details: StockDetails, changes?: HistoricalChanges) => number | undefined;
}

function pctDiff(a: number | undefined, b: number | undefined): number | undefined {
  if (a == null || b == null || b === 0) return undefined;
  return ((a - b) / b) * 100;
}

export const METRICS: Record<string, MetricDef> = {
  below_52w_high: {
    label: "Below 52-Week High",
    unit: "%",
    category: "Price",
    tooltip: "How far the price sits below its 52-week high (0 = at the high)",
    signed: false,
    defaultRule: { operator: "gte", value: 20 },
    compute: (d) => {
      // (high - price) / high, a positive distance below the high
      const v = pctDiff(d.price, d.fiftyTwoWeekHigh);
      return v == null ? undefined : -v;
    },
  },
  pct_above_52w_low: {
    label: "Above 52-Week Low",
    unit: "%",
    category: "Price",
    tooltip: "How far the price sits above its 52-week low (0 = at the low)",
    signed: false,
    defaultRule: { operator: "lte", value: 10 },
    compute: (d) => pctDiff(d.price, d.fiftyTwoWeekLow),
  },
  daily_change_percent: {
    label: "Today's Change",
    unit: "%",
    category: "Price",
    tooltip: "Today's price change",
    signed: true,
    defaultRule: { operator: "lte", value: -3 },
    compute: (d) => d.changePercent,
  },
  price_vs_50d_ma: {
    label: "Price vs 50-Day MA",
    unit: "%",
    category: "Moving Averages",
    tooltip: "How far the price is above (+) or below (-) its 50-day moving average",
    signed: true,
    defaultRule: { operator: "gt", value: 0 },
    compute: (d) => pctDiff(d.price, d.fiftyDayAverage),
  },
  price_vs_200d_ma: {
    label: "Price vs 200-Day MA",
    unit: "%",
    category: "Moving Averages",
    tooltip: "How far the price is above (+) or below (-) its 200-day moving average",
    signed: true,
    defaultRule: { operator: "gt", value: 0 },
    compute: (d) => pctDiff(d.price, d.twoHundredDayAverage),
  },
  change_5d: {
    label: "5-Day Change",
    unit: "%",
    category: "Performance",
    tooltip: "Price change over the last 5 trading days",
    signed: true,
    defaultRule: { operator: "lte", value: -5 },
    compute: (_d, c) => c?.change5D,
  },
  change_1m: {
    label: "1-Month Change",
    unit: "%",
    category: "Performance",
    tooltip: "Price change over the last month",
    signed: true,
    defaultRule: { operator: "gte", value: 5 },
    compute: (_d, c) => c?.change1M,
  },
  change_3m: {
    label: "3-Month Change",
    unit: "%",
    category: "Performance",
    tooltip: "Price change over the last 3 months",
    signed: true,
    defaultRule: { operator: "gte", value: 10 },
    compute: (_d, c) => c?.change3M,
  },
  change_1y: {
    label: "1-Year Change",
    unit: "%",
    category: "Performance",
    tooltip: "Price change over the last year",
    signed: true,
    defaultRule: { operator: "gte", value: 20 },
    compute: (_d, c) => c?.change1Y,
  },
  trailing_pe: {
    label: "Trailing P/E",
    unit: "x",
    category: "Valuation",
    tooltip: "Price-to-earnings ratio on trailing 12-month earnings",
    signed: false,
    defaultRule: { operator: "between", value: 0, valueTo: 15 },
    compute: (d) => d.trailingPE,
  },
  forward_pe: {
    label: "Forward P/E",
    unit: "x",
    category: "Valuation",
    tooltip: "Price-to-earnings ratio on forward earnings estimates",
    signed: false,
    defaultRule: { operator: "between", value: 0, valueTo: 15 },
    compute: (d) => d.forwardPE,
  },
  price_to_book: {
    label: "Price/Book",
    unit: "x",
    category: "Valuation",
    tooltip: "Price-to-book ratio",
    signed: false,
    defaultRule: { operator: "lte", value: 2 },
    compute: (d) => d.priceToBook,
  },
  price_to_sales: {
    label: "Price/Sales",
    unit: "x",
    category: "Valuation",
    tooltip: "Price-to-sales ratio (trailing 12 months)",
    signed: false,
    defaultRule: { operator: "lte", value: 3 },
    compute: (d) => d.priceToSales,
  },
  market_cap_billions: {
    label: "Market Cap",
    unit: "$B",
    category: "Valuation",
    tooltip: "Total market capitalization in billions of dollars",
    signed: false,
    defaultRule: { operator: "gte", value: 10 },
    compute: (d) => (d.marketCap != null ? d.marketCap / 1e9 : undefined),
  },
  dividend_yield: {
    label: "Dividend Yield",
    unit: "%",
    category: "Dividends",
    tooltip: "Annual dividend yield",
    signed: false,
    defaultRule: { operator: "gte", value: 4 },
    compute: (d) => (d.dividendYield != null ? d.dividendYield * 100 : undefined),
  },
  payout_ratio: {
    label: "Payout Ratio",
    unit: "%",
    category: "Dividends",
    tooltip: "Share of earnings paid out as dividends",
    signed: false,
    defaultRule: { operator: "lte", value: 80 },
    compute: (d) => (d.payoutRatio != null ? d.payoutRatio * 100 : undefined),
  },
  profit_margin: {
    label: "Profit Margin",
    unit: "%",
    category: "Profitability",
    tooltip: "Net profit margin",
    signed: false,
    defaultRule: { operator: "gte", value: 10 },
    compute: (d) => (d.profitMargin != null ? d.profitMargin * 100 : undefined),
  },
  return_on_equity: {
    label: "Return on Equity",
    unit: "%",
    category: "Profitability",
    tooltip: "Return on equity",
    signed: false,
    defaultRule: { operator: "gte", value: 15 },
    compute: (d) => (d.returnOnEquity != null ? d.returnOnEquity * 100 : undefined),
  },
  beta: {
    label: "Beta",
    unit: "",
    category: "Risk",
    tooltip: "Volatility relative to the market (1 = moves with the market)",
    signed: false,
    defaultRule: { operator: "lte", value: 1 },
    compute: (d) => d.beta,
  },
  debt_to_equity: {
    label: "Debt/Equity",
    unit: "x",
    category: "Risk",
    tooltip: "Debt-to-equity ratio",
    signed: false,
    defaultRule: { operator: "lte", value: 1 },
    compute: (d) => d.debtToEquity,
  },
  recommendation_mean: {
    label: "Analyst Rating (1 Buy … 5 Sell)",
    unit: "",
    category: "Analyst",
    tooltip: "Mean analyst recommendation: 1 = Strong Buy, 3 = Hold, 5 = Sell",
    signed: false,
    defaultRule: { operator: "lte", value: 2.5 },
    compute: (d) => d.recommendationMean,
  },
  upside_to_target: {
    label: "Upside to Target",
    unit: "%",
    category: "Analyst",
    tooltip: "Distance from the current price to the mean analyst target (+ = target above price)",
    signed: true,
    defaultRule: { operator: "gte", value: 10 },
    compute: (d) => pctDiff(d.targetMeanPrice, d.price),
  },
};

export const PERFORMANCE_METRICS = new Set(["change_5d", "change_1m", "change_3m", "change_1y"]);

export const DEFAULT_METRIC = "below_52w_high";

/** A complete rule for a metric, using that metric's default operator and value. */
export function defaultRuleFor(metric: string): ScreenRule {
  const def = METRICS[metric] ?? METRICS[DEFAULT_METRIC];
  const key = METRICS[metric] ? metric : DEFAULT_METRIC;
  return { metric: key, ...def.defaultRule };
}

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
    case "between": {
      if (thresholdTo == null) return false;
      const lo = Math.min(threshold, thresholdTo);
      const hi = Math.max(threshold, thresholdTo);
      return value >= lo && value <= hi;
    }
    default: return false;
  }
}

const FLIPPED_OPERATOR: Record<string, ScreenOperator> = {
  gte: "lte",
  lte: "gte",
  gt: "lt",
  lt: "gt",
  between: "between",
};

/**
 * Bring a stored rule up to the current metric definitions. Older rules may
 * use the signed "% off 52-week high" metric (negative = below the high), a
 * raw-dollar market cap, or the retired "=" operator. Rules are stored as
 * JSON, so this runs on every read rather than as a migration.
 */
export function normalizeRule(raw: {
  metric: string;
  operator: string;
  value: number;
  valueTo?: number;
}): ScreenRule {
  let { metric, value, valueTo } = raw;
  let operator = raw.operator as string;

  if (operator === "eq") {
    operator = "between";
    valueTo = value;
  }

  if (metric === "pct_off_52w_high") {
    // Old: (price - high) / high, so "20% off" was "<= -20".
    // New: (high - price) / high, so "20% off" is ">= 20".
    metric = "below_52w_high";
    operator = FLIPPED_OPERATOR[operator] ?? operator;
    if (operator === "between" && valueTo != null) {
      [value, valueTo] = [-valueTo, -value];
    } else {
      value = -value;
    }
    if (Object.is(value, -0)) value = 0;
    if (valueTo != null && Object.is(valueTo, -0)) valueTo = 0;
  }

  if (metric === "market_cap") {
    metric = "market_cap_billions";
    value = value / 1e9;
    if (valueTo != null) valueTo = valueTo / 1e9;
  }

  if (operator === "between") {
    if (valueTo == null) valueTo = value;
    if (valueTo < value) [value, valueTo] = [valueTo, value];
  } else {
    valueTo = undefined;
  }

  const rule: ScreenRule = { metric, operator: operator as ScreenOperator, value };
  if (valueTo !== undefined) rule.valueTo = valueTo;
  return rule;
}

export function normalizeRules(
  raw: { metric: string; operator: string; value: number; valueTo?: number }[]
): ScreenRule[] {
  return raw.map(normalizeRule);
}

/** Column header for a metric: the label plus its unit, e.g. "5-Day Change (%)". */
export function metricHeading(key: string): string {
  const def = METRICS[key];
  if (!def) return key;
  return def.unit ? `${def.label} (${def.unit})` : def.label;
}

/** Format a metric value for display. Signed metrics carry an explicit +/-. */
export function formatMetricValue(value: number | undefined, key: string): string {
  if (value === undefined || value === null) return "N/A";
  const def = METRICS[key];
  const unit = def?.unit ?? "";
  const sign = def?.signed && value > 0 ? "+" : "";
  if (unit === "$B") {
    if (Math.abs(value) < 1) return `$${(value * 1000).toFixed(0)}M`;
    return `$${value.toFixed(1)}B`;
  }
  if (unit === "%") return `${sign}${value.toFixed(2)}%`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  return `${sign}${value.toFixed(2)}`;
}

export function getMetricsByCategory(): Record<MetricCategory, { key: string; def: MetricDef }[]> {
  const grouped: Record<string, { key: string; def: MetricDef }[]> = {};
  for (const [key, def] of Object.entries(METRICS)) {
    if (!grouped[def.category]) grouped[def.category] = [];
    grouped[def.category].push({ key, def });
  }
  return grouped as Record<MetricCategory, { key: string; def: MetricDef }[]>;
}
