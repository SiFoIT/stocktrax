import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import {
  alertScopes,
  alertMetrics,
  alertOperators,
  alertResetStrategies,
} from "@/lib/alerts/config";

export const portfolios = sqliteTable("portfolios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  currency: text("currency", { enum: ["USD", "CAD"] }).notNull().default("CAD"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const holdings = sqliteTable("holdings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  portfolioId: integer("portfolio_id")
    .notNull()
    .references(() => portfolios.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  shares: real("shares").notNull(),
  avgCost: real("avg_cost").notNull(),
  currency: text("currency").notNull().default("USD"),
}, (table) => [
  index("idx_holdings_portfolio_id").on(table.portfolioId),
]);

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  holdingId: integer("holding_id")
    .notNull()
    .references(() => holdings.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["buy", "sell", "dividend", "transfer_in"] }).notNull(),
  shares: real("shares").notNull(),
  price: real("price").notNull(),
  date: integer("date", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("idx_transactions_holding_id").on(table.holdingId),
]);

export const stockCache = sqliteTable("stock_cache", {
  symbol: text("symbol").primaryKey(),
  data: text("data").notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
});

export type Portfolio = typeof portfolios.$inferSelect;
export type NewPortfolio = typeof portfolios.$inferInsert;
export type Holding = typeof holdings.$inferSelect;
export type NewHolding = typeof holdings.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type StockCache = typeof stockCache.$inferSelect;

export const cashTransactions = sqliteTable("cash_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  portfolioId: integer("portfolio_id")
    .notNull()
    .references(() => portfolios.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["contribution", "deposit", "refund", "referral", "transfer_in", "transfer_out"],
  }).notNull(),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("CAD"),
  date: integer("date", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("idx_cash_transactions_portfolio_id").on(table.portfolioId),
]);

export type CashTransaction = typeof cashTransactions.$inferSelect;
export type NewCashTransaction = typeof cashTransactions.$inferInsert;

export const watchlists = sqliteTable("watchlists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const watchlistItems = sqliteTable("watchlist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  watchlistId: integer("watchlist_id")
    .notNull()
    .references(() => watchlists.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  addedAt: integer("added_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("idx_watchlist_items_watchlist_id").on(table.watchlistId),
  index("idx_watchlist_items_symbol").on(table.symbol),
]);

export type Watchlist = typeof watchlists.$inferSelect;
export type NewWatchlist = typeof watchlists.$inferInsert;
export type WatchlistItem = typeof watchlistItems.$inferSelect;
export type NewWatchlistItem = typeof watchlistItems.$inferInsert;

export const alertRules = sqliteTable("alert_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scope: text("scope", { enum: alertScopes }).notNull(),
  watchlistItemId: integer("watchlist_item_id").references(() => watchlistItems.id, {
    onDelete: "cascade",
  }),
  holdingId: integer("holding_id").references(() => holdings.id, {
    onDelete: "cascade",
  }),
  symbol: text("symbol").notNull(),
  metric: text("metric", { enum: alertMetrics }).notNull(),
  operator: text("operator", { enum: alertOperators }).notNull(),
  threshold: real("threshold").notNull(),
  resetStrategy: text("reset_strategy", { enum: alertResetStrategies }).notNull(),
  anchorValue: real("anchor_value"),
  cooldownMinutes: integer("cooldown_minutes").default(60),
  baselineValue: real("baseline_value"),
  needsRecovery: integer("needs_recovery", { mode: "boolean" }).default(false).notNull(),
  isMuted: integer("is_muted", { mode: "boolean" }).default(false).notNull(),
  cooldownUntil: integer("cooldown_until", { mode: "timestamp" }),
  lastTriggeredAt: integer("last_triggered_at", { mode: "timestamp" }),
  lastResetAt: integer("last_reset_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("idx_alert_rules_scope_symbol").on(table.scope, table.symbol),
  index("idx_alert_rules_watchlist_item").on(table.watchlistItemId),
  index("idx_alert_rules_holding").on(table.holdingId),
]);

export const alerts = sqliteTable("alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleId: integer("rule_id")
    .notNull()
    .references(() => alertRules.id, { onDelete: "cascade" }),
  scope: text("scope", { enum: alertScopes }).notNull(),
  symbol: text("symbol").notNull(),
  message: text("message").notNull(),
  metricValue: real("metric_value"),
  price: real("price"),
  changePercent: real("change_percent"),
  triggeredAt: integer("triggered_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  acknowledgedAt: integer("acknowledged_at", { mode: "timestamp" }),
  resetStrategy: text("reset_strategy", { enum: alertResetStrategies }).notNull(),
  operator: text("operator", { enum: alertOperators }).notNull(),
  threshold: real("threshold").notNull(),
}, (table) => [
  index("idx_alerts_rule_id").on(table.ruleId),
  index("idx_alerts_triggered_at").on(table.triggeredAt),
]);

export type AlertRule = typeof alertRules.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;

export const screens = sqliteTable("screens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  source: text("source").notNull().default("all"),
  rules: text("rules").notNull().default("[]"),
  match: text("match", { enum: ["all", "any"] }).notNull().default("all"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Screen = typeof screens.$inferSelect;
export type NewScreen = typeof screens.$inferInsert;

export const screenPresets = sqliteTable("screen_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  rules: text("rules").notNull().default("[]"),
  match: text("match", { enum: ["all", "any"] }).notNull().default("all"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type ScreenPresetRow = typeof screenPresets.$inferSelect;
export type NewScreenPresetRow = typeof screenPresets.$inferInsert;
