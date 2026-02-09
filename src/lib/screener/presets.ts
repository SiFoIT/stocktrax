import { ScreenRule } from "./metrics";

export interface ScreenPreset {
  name: string;
  rules: ScreenRule[];
  match: "all" | "any";
}

export const SCREEN_PRESETS: ScreenPreset[] = [
  {
    name: "20% Off Highs",
    rules: [
      { metric: "pct_off_52w_high", operator: "lte", value: -20 },
    ],
    match: "all",
  },
  {
    name: "High Yield",
    rules: [
      { metric: "dividend_yield", operator: "gte", value: 4 },
      { metric: "payout_ratio", operator: "lte", value: 80 },
    ],
    match: "all",
  },
  {
    name: "Value Play",
    rules: [
      { metric: "trailing_pe", operator: "lte", value: 15 },
      { metric: "price_to_book", operator: "lte", value: 2 },
      { metric: "trailing_pe", operator: "gt", value: 0 },
    ],
    match: "all",
  },
  {
    name: "Momentum",
    rules: [
      { metric: "change_1m", operator: "gte", value: 5 },
      { metric: "change_3m", operator: "gte", value: 10 },
      { metric: "price_vs_50d_ma", operator: "gt", value: 0 },
    ],
    match: "all",
  },
  {
    name: "Analyst Favorites",
    rules: [
      { metric: "recommendation_mean", operator: "lte", value: 2.5 },
      { metric: "upside_to_target", operator: "gte", value: 10 },
    ],
    match: "all",
  },
];
