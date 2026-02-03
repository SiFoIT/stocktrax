import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const portfolios = sqliteTable("portfolios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  currency: text("currency", { enum: ["USD", "CAD"] }).notNull().default("USD"),
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
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  holdingId: integer("holding_id")
    .notNull()
    .references(() => holdings.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["buy", "sell", "dividend"] }).notNull(),
  shares: real("shares").notNull(),
  price: real("price").notNull(),
  date: integer("date", { mode: "timestamp" }).notNull(),
});

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
});

export type Watchlist = typeof watchlists.$inferSelect;
export type NewWatchlist = typeof watchlists.$inferInsert;
export type WatchlistItem = typeof watchlistItems.$inferSelect;
export type NewWatchlistItem = typeof watchlistItems.$inferInsert;
