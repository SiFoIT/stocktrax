export const alertScopes = ["watchlist", "holding"] as const;
export const alertMetrics = [
  "daily_change_percent",
  "last_price",
  "price_vs_anchor",
  "holding_gain_percent",
] as const;
export const alertOperators = ["gte", "lte"] as const;
export const alertResetStrategies = [
  "manual",
  "recovery",
  "cooldown",
  "baseline",
  "end_of_day",
] as const;

export type AlertScope = (typeof alertScopes)[number];
export type AlertMetric = (typeof alertMetrics)[number];
export type AlertOperator = (typeof alertOperators)[number];
export type AlertResetStrategy = (typeof alertResetStrategies)[number];

export const ALERT_METRIC_LABELS: Record<AlertMetric, string> = {
  daily_change_percent: "Daily % Change",
  last_price: "Last Price",
  price_vs_anchor: "Price vs Anchor %",
  holding_gain_percent: "Holding Gain %",
};

export const ALERT_RESET_LABELS: Record<AlertResetStrategy, string> = {
  manual: "Manual reset",
  recovery: "Auto reset on recovery",
  cooldown: "Cooldown timer",
  baseline: "Baseline shift",
  end_of_day: "End of day reset",
};

export const ALERT_OPERATOR_LABELS: Record<AlertOperator, string> = {
  gte: "at or above",
  lte: "at or below",
};
