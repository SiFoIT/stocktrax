# StockTrax — Improvement Ideas / TODO

High-level suggestions, roughly ordered by value. The project is already well past a
basic tracker (alerts, screener, CSV import, dividends, insider data, market overview),
so these focus on the next tier of value.

## 1. Portfolio value history + real return metrics

The biggest gap. All the raw data exists (transactions, cash transactions, FX) to
compute time-weighted and money-weighted (XIRR) returns, but there's no snapshot of
portfolio value over time — so there's no "how am I actually doing" chart.

- Add a daily snapshot table storing per-portfolio value (CAD/USD).
- Populate via a cron or on-first-request-of-day job.
- Unlocks a performance chart over time.
- From there, benchmark comparison ("vs. VFV/SPY since inception") is cheap.

This is the feature that turns a tracker into something that answers the question you
actually have. **Highest-leverage item — everything it needs is already in the schema.**

## 2. Realized gains / ACB (adjusted cost base) report

Useful at tax time, especially for CAD portfolios holding USD stocks.

- Per-year realized gain/loss view.
- Subtlety: CRA requires ACB in CAD using **trade-date exchange rates**, which the
  current avg-cost-in-native-currency model doesn't capture.
- Bonus: superficial-loss flagging.

## 3. Tests for the money math

No test framework in the repo. Recent commit history ("fix: correct portfolio
calculations, currency handling") is exactly the kind of thing that regresses silently.

- Add Vitest.
- Pin down: cost basis, FX conversion, dividend aggregation, CSV import parsing —
  all pure-ish functions.
- **Do this before adding more calculation features.**

## 4. Background alert evaluation + push notifications

If alerts only evaluate while a browser tab is open, they miss the moves that matter.

- Small scheduled evaluator (setInterval in a Node sidecar, or a cron hitting an
  endpoint in the Docker deployment).
- Add Web Push — PWA manifest already exists, so partway to installable-with-notifications.

## 5. Data-source resilience

yahoo-finance2 is unofficial and breaks periodically (search validation already patched).

- Wrap it behind a small provider interface so a fallback (e.g. Stooq for quotes) can slot in.
- Serve stale cache with a "data as of" badge instead of erroring when Yahoo hiccups.
- Scheduled SQLite backups (`VACUUM INTO` a timestamped file) — one corrupted file
  currently loses the full transaction history.

## 6. Rebalancing view

- Target allocation per holding or asset class.
- Show current drift.
- "Buy $X of Y to rebalance" suggestions.
- Composes with the cash-transaction data already tracked.

## Smaller infra notes

- Consider moving from `drizzle-kit push` to generated migration files now that the
  schema is nontrivial — push can be lossy on column changes, risky against a DB
  holding years of transactions.
- If the Docker deployment is ever reachable beyond localhost, it needs at least a
  basic auth layer — every API route is currently open.
