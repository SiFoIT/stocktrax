CREATE TABLE `alert_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text NOT NULL,
	`watchlist_item_id` integer,
	`holding_id` integer,
	`symbol` text NOT NULL,
	`metric` text NOT NULL,
	`operator` text NOT NULL,
	`threshold` real NOT NULL,
	`reset_strategy` text NOT NULL,
	`anchor_value` real,
	`cooldown_minutes` integer DEFAULT 60,
	`baseline_value` real,
	`needs_recovery` integer DEFAULT false NOT NULL,
	`is_muted` integer DEFAULT false NOT NULL,
	`cooldown_until` integer,
	`last_triggered_at` integer,
	`last_reset_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`watchlist_item_id`) REFERENCES `watchlist_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`holding_id`) REFERENCES `holdings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_alert_rules_scope_symbol` ON `alert_rules` (`scope`,`symbol`);--> statement-breakpoint
CREATE INDEX `idx_alert_rules_watchlist_item` ON `alert_rules` (`watchlist_item_id`);--> statement-breakpoint
CREATE INDEX `idx_alert_rules_holding` ON `alert_rules` (`holding_id`);--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` integer NOT NULL,
	`scope` text NOT NULL,
	`symbol` text NOT NULL,
	`message` text NOT NULL,
	`metric_value` real,
	`price` real,
	`change_percent` real,
	`triggered_at` integer NOT NULL,
	`acknowledged_at` integer,
	`reset_strategy` text NOT NULL,
	`operator` text NOT NULL,
	`threshold` real NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `alert_rules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_alerts_rule_id` ON `alerts` (`rule_id`);--> statement-breakpoint
CREATE INDEX `idx_alerts_triggered_at` ON `alerts` (`triggered_at`);--> statement-breakpoint
CREATE TABLE `cash_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_id` integer NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'CAD' NOT NULL,
	`date` integer NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cash_transactions_portfolio_id` ON `cash_transactions` (`portfolio_id`);--> statement-breakpoint
CREATE TABLE `holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_id` integer NOT NULL,
	`symbol` text NOT NULL,
	`shares` real NOT NULL,
	`avg_cost` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_holdings_portfolio_id` ON `holdings` (`portfolio_id`);--> statement-breakpoint
CREATE TABLE `portfolios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'CAD' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_cache` (
	`symbol` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`holding_id` integer NOT NULL,
	`type` text NOT NULL,
	`shares` real NOT NULL,
	`price` real NOT NULL,
	`date` integer NOT NULL,
	FOREIGN KEY (`holding_id`) REFERENCES `holdings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_transactions_holding_id` ON `transactions` (`holding_id`);--> statement-breakpoint
CREATE TABLE `watchlist_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watchlist_id` integer NOT NULL,
	`symbol` text NOT NULL,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`watchlist_id`) REFERENCES `watchlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_watchlist_items_watchlist_id` ON `watchlist_items` (`watchlist_id`);--> statement-breakpoint
CREATE INDEX `idx_watchlist_items_symbol` ON `watchlist_items` (`symbol`);--> statement-breakpoint
CREATE TABLE `watchlists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
