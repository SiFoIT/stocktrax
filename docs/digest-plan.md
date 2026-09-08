# Email digest: daily and weekly summary

Implementation plan. Decisions below were made in discussion and are settled;
do not re-open them. Follow the design-token rules in `CLAUDE.md` for the
settings UI. Do not commit unless asked.

## Goal

Send a short, scannable email summarising the portfolios and watchlists:

- **Daily** on trading days, after the close. "What happened today."
- **Weekly** on Saturday morning. "Where do I stand." Ends with a full table
  of every holding and every watchlist symbol with its weekly change.

Nothing runs in the background today; alerts only evaluate while a browser
tab is open. This feature adds the first server-side scheduler, server-side
settings, and an outbound email transport. All three are built so that
background alert evaluation (TODO §4) can reuse them later, but that work is
**out of scope** here.

Explicitly out of scope: push channels (ntfy, Web Push), per-portfolio or
per-watchlist selection (everything is included), HTML-in-app notification
centre, any change to how alerts are evaluated.

## Settled decisions

- **Email only, over plain SMTP** via `nodemailer`. Gmail with an App Password
  is the documented setup, but any SMTP relay (SendGrid, Mailgun, Resend,
  self-hosted) works with the same six fields. No provider SDKs.
- **SMTP settings live in the UI**, stored in a new `settings` table. The
  password is write-only: the API never returns it, the form shows a "saved"
  placeholder, and it is excluded from the backup export. Env vars
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`,
  `DIGEST_FROM`, `DIGEST_TO` are read as a fallback when the DB value is empty,
  so Docker users can configure headlessly. README gets a note that the app
  has no login, so anyone who can reach it can trigger a test email.
- **Scheduler is in-process**, started from `src/instrumentation.ts`
  (`register()`), Node runtime only. One `setInterval` ticks every 60 s. No
  sidecar, no extra container. A manual trigger endpoint also exists so an
  external cron can drive it instead.
- **The send times are fixed, not settings.** Daily at 17:00 on trading days
  (holiday calendar in `src/lib/markets/calendar.ts`), weekly Saturday at
  08:00. `DAILY_TIME` / `WEEKLY_TIME` in `due.ts`. The user chooses *whether*
  to get each email, not when.
  An editable time buys nothing and costs three things: quotes are 15–20 min
  delayed so anything before 16:30 reports intraday figures under a "Closing
  prices" footer; the daily send also gates `writeSnapshots`, so a pre-close
  time banks a mid-session value as that day's mark; and because
  `writeSnapshots` skips a date that already has rows, the real close can
  never replace it. The weekly would then measure from that bad baseline and,
  finding a snapshot, would not label the result estimated.
- **Missed sends catch up, once.** If the container was down at 17:00, the
  next tick that same calendar day sends it. A `lastSent.daily` /
  `lastSent.weekly` marker (date string) in `settings` prevents double sends
  across restarts. After midnight a missed daily is simply skipped.
- **Portfolio week change comes from daily snapshots**, not from re-pricing
  holdings a week back. A new `portfolio_snapshots` table gets one row per
  portfolio per trading day, written by the daily job (and by the weekly job
  if the daily didn't run). This is accurate through buys, sells and cash
  movements, and it is the seed for a future value-history chart. Until a
  snapshot from 5+ trading days ago exists, fall back to
  `getHistoricalPrice` per holding and say "est." next to the week figure.
- **Per-symbol weekly change comes from prices**, not snapshots:
  `price_now / price_5_trading_days_ago − 1`, using
  `getHistoricalPricesMultiDate` (already used by the summary route). Weekly
  dollar change for a holding is `shares × (price_now − price_then)`.
- **Values are CAD**, converted the same way the portfolio summary route does
  (USD × `USDCAD=X`). Prices in the tables stay in the symbol's own currency.
- **One combined holdings table** in the weekly, not one per portfolio. A
  symbol held in two portfolios is merged (shares summed). Sorted by weekly
  % change, best to worst. Same for the watchlist table (one per watchlist,
  since watchlists are the user's own grouping).
- **The portfolio section is the one place portfolios are broken out**: one
  named row each, then a bold Total when there is more than one. A single
  portfolio gets its own name and no Total, which would only repeat it.
  Holdings, movers and watchlists stay merged across portfolios.
- **Every table reads as one descending run** — biggest gain at the top,
  biggest loss at the bottom. Sorting by the size of the move instead drops a
  heavy faller into the middle of the gainers, where it reads as a gain.
- **Markets-only tile row at the top of both emails**: S&P 500, TSX,
  Nasdaq, CAD/USD. Each tile carries its level and then its change — today's
  in the daily, the week's in the weekly. Index levels are whole numbers (four
  or five digits leave no room for decimals beside the change); the FX rate
  keeps three. Nothing about the portfolio goes in a tile.
- **The portfolio is one line, not a hero number.** Combined value across
  all portfolios with the change in $ and %, same font size as everything
  else. No per-portfolio breakdown anywhere in either email. All time and
  CAGR appear only in the weekly, as one small line under it, because they
  are portfolio figures and belong with the portfolio, not with the markets.
- **Test sends use live data and are marked.** "Send daily now" / "Send
  weekly now" build from current quotes and whatever snapshots exist, with
  the subject prefixed `[Test]`. They never write snapshots and never touch
  the `lastSent` markers, so a test cannot suppress that day's real send.
  A weekly test before any week-old snapshot exists uses the historical-price
  fallback and shows "est.", exactly as the first real weekly would.
- **Show dollar values is a render-time privacy switch**, default on. When
  off, every $ figure is dropped and percentages stay: the portfolio line is
  % only; Movers and Best/Worst keep their price column, since a per-share
  price says nothing about size; the holdings table loses
  Value and Week $; Dividends and Activity show symbols and counts without
  amounts; the All time line keeps only the %. `DigestData` is unchanged;
  only `render.ts` reads the flag.
- **Skip quiet days**, default off. When on, the daily is not sent unless
  at least one of: |portfolio today %| ≥ `quietThresholdPct` (default 0.5),
  an alert fired today, a dividend was received today. A skipped day still
  writes its snapshot and sets `lastSent.daily`, and logs a `skipped` row in
  `digest_log` so "Last sent" can say why. The weekly is never skipped.
- **Multiple recipients**: `smtp.to` accepts a comma-separated list.
- **Both digests default to on**, because a user who fills in SMTP wants the
  emails. The scheduler skips sending entirely while SMTP is unconfigured, so
  a fresh install logs nothing; snapshots still accumulate so the first weekly
  after setup has a baseline.
- **Empty sections are omitted.** A quiet day is the header, tiles, the
  portfolio block and the footer.
- **Light palette only.** Gmail dark mode inverts colours unpredictably; a
  light design degrades more gracefully than a dark one.
- **Every email has a plain-text alternative**, generated from the same
  `DigestData`, never hand-maintained.
- **Failure is logged, never retried automatically.** A send failure is
  written to `digest_log` and surfaced in the settings modal as "Last send
  failed: <reason>". The `lastSent` marker is only written on success, so
  the next tick retries within the same day's catch-up window.

## Content

### Daily (subject: `StockTrax daily · Mon Sep 8`)

1. **Header**: wordmark, "Daily · <date>".
2. **Markets**: four tiles, level then today's %: S&P 500 (`^GSPC`), TSX
   (`^GSPTSE`), Nasdaq (`^IXIC`), CAD/USD (`CADUSD=X`) — e.g. `6,812 −0.6%`
   and `0.726 +0.2%`, the % smaller and coloured.
   Same quotes the Markets page headline cards use.
3. **Portfolio · today**: section label carries the period, like the Markets
   label above it. One row per portfolio — its name, value, today's $ change
   and % — then a bold Total row when there is more than one. No period suffix
   on the numbers.
4. *(intentionally no All time in the daily)*
5. **Movers**: holdings that moved more than ±1 % today, top 3 up and top 3
   down by %. Symbol, short name, closing price, % — the same shape as a
   watchlist row, so the two sections read alike. No $ impact: the reader
   cares which stocks moved, not what it did to the total.
6. **Watchlist**: watchlist symbols that moved more than ±2 % today (threshold
   is a setting, default 2; 0 disables the section). Symbol, name, price, %.
   Sorted by signed %, so the section reads as one descending run.
7. **Alerts fired**: rows from `alerts` with `triggeredAt` on this trading
   day. Symbol badge + the stored `message`.
8. **Dividends**: `transactions` of type `dividend` dated today, summed per
   symbol.
9. **Footer**: "Closing prices · Values in CAD · Open StockTrax ·
   Digest settings". Both sends land after the 16:00 close, so the numbers are
   closing prices and a delay caveat would be wrong as well as noisy. Links use a `DIGEST_APP_URL` setting (default empty →
   links omitted).

### Weekly (subject: `StockTrax weekly · Sep 1 – 5`)

Week = the Monday to Friday just ended. "Last week's close" = the snapshot
dated the previous Friday (or nearest earlier trading day).

1. **Header**: wordmark, "Weekly · <Mon> – <Fri>, <year>".
2. **Markets**: same four tiles, level and the week's %.
3. **Portfolio · this week**: same shape as the daily rows, week $ and %. The
   snapshot baseline is read per portfolio, so "est." lands on the rows that
   actually lack one.
4. **All time / CAGR line** under it, small muted text:
   "All time +$22,905 (+14.2%) since Mar 2021 · CAGR 9.8% per year over
   5.5 yrs". The only place these two figures appear.
5. **Best / Worst this week**: two columns, top 3 and bottom 3 holdings by
   week %, with week $.
6. **Fact rows** (each omitted when empty):
   - **52-week**: holdings or watchlist symbols whose week's high ≥
     `fiftyTwoWeekHigh` or low ≤ `fiftyTwoWeekLow` → "NVDA new high".
   - **Dividends**: $ received this week (symbols), $ year to date.
   - **Next week**: symbols with `exDividendDate` in the coming Mon–Fri, with
     weekday.
   - **Activity**: counts of buys and sells, and net cash in/out from
     `cash_transactions`, this week.
   - **Alerts**: count fired this week, and the symbol with the most.
   - **Top holding**: largest position as % of total. One line.
7. **All holdings**: Symbol, Price, Week %, Value, Week $. Merged across
   portfolios, sorted by week % desc.
8. **Watchlist · <name>**: one table per watchlist. Symbol, Price, Week %,
   and a 52-wk note ("near high" / "near low" when within 3 % of the range
   end, otherwise blank). Sorted by week % desc.
9. **Footer**: as daily.

### Definitions (weekly All time / CAGR line)

- **All time** = `(marketValue − costBasis) / costBasis` across all
  portfolios, i.e. the dashboard's total gain %. The line gives the $ and
  the month of the earliest transaction across all portfolios, which is the
  start date for both figures.
- **CAGR** = `(marketValue / costBasis) ^ (1 / years) − 1` where `years` is
  measured from the earliest transaction. This is exactly what
  `api/portfolios/summary` computes today; the digest does not recompute it.
  It treats all capital as invested from day one, so it understates the true
  rate for someone who contributes regularly. Accepted; it matches the app.

## Schema

Add to `src/lib/db/schema.ts`, then `npx drizzle-kit push`.

```ts
settings            key TEXT PK, value TEXT (JSON), updated_at
portfolio_snapshots id, portfolio_id FK cascade, date TEXT 'YYYY-MM-DD',
                    market_value REAL, cost_basis REAL, day_change REAL,
                    currency TEXT 'CAD', created_at
                    unique(portfolio_id, date), index(date)
digest_log          id, kind TEXT 'daily'|'weekly'|'test', sent_at,
                    status TEXT 'sent'|'failed'|'skipped', subject TEXT, error TEXT
```

Settings keys (all JSON values):

```
digest.daily.enabled   boolean  true
digest.weekly.enabled  boolean  true
digest.timezone        IANA     "America/Toronto"  (weekly arrival only)
digest.watchlistMovePct number  2        (0 = no watchlist section)
digest.showDollars     boolean  true
digest.skipQuietDays   boolean  false
digest.quietThresholdPct number 0.5
digest.appUrl          string   ""
digest.lastSent.daily  "YYYY-MM-DD"
digest.lastSent.weekly "YYYY-MM-DD"
smtp.host smtp.port smtp.secure smtp.user smtp.pass smtp.from smtp.to
(smtp.to is a comma-separated list; trimmed and validated with Zod)
```

Add `settings` to the backup export (`src/lib/backup/settings-registry.ts`)
with `smtp.pass` and the two `lastSent` keys excluded. `portfolio_snapshots`
is user data and is included; `digest_log` is not.

## Files

| File | Role |
|---|---|
| `src/lib/settings.ts` | `getSetting(key, default)`, `setSetting`, `getSettings(prefix)`. Env fallback for `smtp.*` and `digest.appUrl`. |
| `src/lib/portfolio-summary.ts` | **Extracted** from `api/portfolios/summary/route.ts` so the digest can call it without an HTTP self-request. The route becomes a thin wrapper with the same cache behaviour. |
| `src/lib/digest/types.ts` | `DigestData` (daily and weekly variants). Plain numbers and strings; no DB or Yahoo types leak in. |
| `src/lib/digest/build.ts` | `buildDailyDigest(now)`, `buildWeeklyDigest(now)`. All data fetching and the selection rules (thresholds, top 3, merging, sorting). |
| `src/lib/digest/snapshots.ts` | `writeSnapshots(date)`, `getSnapshot(portfolioId, onOrBefore)`. |
| `src/lib/digest/render.ts` | `renderHtml(data)`, `renderText(data)`. Pure. Tables + inline styles only; `docs/mockups/digest-email.html` is the reference. |
| `src/lib/digest/send.ts` | `sendDigest(kind, { test })`: build → quiet-day check (real daily only) → render → `nodemailer` → `digest_log`. `test: true` prefixes the subject and skips snapshots/markers. Also `sendTestEmail()` (plain connectivity message). |
| `src/lib/digest/scheduler.ts` | `startScheduler()`: 60 s tick, due-time logic, catch-up window, `lastSent` markers. Guarded by a module-level flag so HMR cannot start it twice. |
| `src/instrumentation.ts` | `register()` → `startScheduler()` when `process.env.NEXT_RUNTIME === "nodejs"`. |
| `src/app/api/settings/digest/route.ts` | `GET` (password masked as `hasPassword: true`), `PUT` (Zod; empty password field = keep existing). |
| `src/app/api/digest/route.ts` | `POST { kind: "daily" \| "weekly" \| "smtp-test", test?: boolean }` → sends now. `test: true` is what the UI buttons send; an external cron omits it to perform the real send with snapshots and markers. Returns the `digest_log` row. |
| `src/app/api/digest/preview/route.ts` | `GET ?kind=daily\|weekly` → the HTML body. For development and for a "Preview" link in settings. |
| `src/components/settings/digest-settings-modal.tsx` | New modal, opened from `settings-menu.tsx` next to General and Data. |
| `README.md` | "Email digest" section: Gmail App Password steps, the env fallback, the no-login caveat, external-cron alternative. |

Dependencies: `nodemailer`, `@types/nodemailer`, `vitest` (dev).

## Scheduler logic

**Two clocks.** Dates and the daily's hour are market time
(`MARKET_TIMEZONE`, America/New_York): which day it is, whether the market was
open, the date on the email and which alerts and dividends belong to it are
facts about the session, not about the reader. Pinning them to the reader's
zone was a latent bug — a reader east of New York would see Tuesday's session
labelled Wednesday, and the `lastSent` marker would then suppress Wednesday's
own digest. The reader's zone decides one thing: the hour the weekly lands.
The weekly needs *both* Saturdays, because the market's Saturday begins on
Friday evening out west and arrives after a Pacific reader's Saturday
breakfast in the east.

On each tick:

1. Compute `today` (`YYYY-MM-DD`) and `now` (`HH:MM`).
2. **Daily**: if enabled, `today` is a trading day (`isMarketOpen`-style
   check against the holiday calendar, weekday Mon–Fri), `now ≥ DAILY_TIME`,
   and `lastSent.daily !== today` → `writeSnapshots(today)` then
   `sendDigest("daily")`; on success set `lastSent.daily = today`.
3. **Weekly**: if enabled, weekday is Saturday, `now ≥ WEEKLY_TIME`, and
   `lastSent.weekly !== today` → ensure Friday's snapshot exists (write it if
   missing, using current quotes) then `sendDigest("weekly")`; on success set
   `lastSent.weekly = today`.
4. Snapshots are written even when the daily digest is disabled, so the
   weekly always has data. Guard: only write a snapshot for a date once.

Ticks are serialised (skip if a previous tick is still running).

## Settings UI

Modal titled "Email digest", two sections, using existing `Modal`, inputs
and button primitives:

- **Delivery**: SMTP host, port, "Use TLS" toggle, username, password
  (placeholder "Saved" when `hasPassword`), from, to (one or more addresses,
  comma-separated). Buttons: **Save**, **Send test email**. Result line
  shows success or the SMTP error verbatim.
- **Schedule**: Daily toggle, Weekly toggle, timezone dropdown. No time
  pickers — each toggle's hint states when that email arrives and on whose
  clock ("5:00 PM Eastern" / "8:00 AM your time").
  The dropdown offers ~17 curated zones (`src/lib/timezones.ts`), not the full
  IANA set: North America first, then one per common offset elsewhere. They are
  zone ids rather than fixed UTC offsets so daylight saving is carried; a
  "UTC−5" entry would drift an hour every spring. The browser's reported zone
  is matched onto the list *by current offset*, so a reader in Winnipeg or
  Chicago lands on Central instead of on the default. A stored zone that is not
  on the list still renders as its own option, and the API refuses a zone Intl
  cannot parse rather than throwing inside every scheduler tick.
- **Content**: Watchlist move threshold (%, 0 = off), **Show dollar values**
  toggle (default on), **Skip quiet days** toggle (default off) with its
  threshold % shown only when on.
- **Actions**: **Send daily now**, **Send weekly now** (both test sends, see
  settled decisions), **Preview** (opens the preview route in a new tab).
  "Last sent" line from `digest_log`, including "skipped (quiet day)".

Neutral styling throughout; no colour except the positive/negative result
line. Inline `lucide-react` icons only.

## Tests

Add Vitest (`npm test`). Cover the pure parts:

- `build.ts` selection rules with fixture data: ±1 % mover filter, top 3 each
  way, watchlist threshold (including 0 = off), merging a symbol held in two
  portfolios, sort order, week-change fallback when no snapshot exists,
  quiet-day decision.
- `render.ts`: `renderText` output for a fixture daily and weekly (snapshot
  test), that omitted sections leave no heading behind in HTML, and that
  `showDollars: false` leaves no `$` anywhere in either output.
- `scheduler.ts` due-time logic with a fake clock: fires once, not twice;
  catch-up same day; skips after midnight; skips holidays.

## Acceptance

- With SMTP configured and both digests enabled, a daily email arrives on
  trading days at the configured time and a weekly on Saturday, matching the
  content spec, in Gmail on desktop and phone.
- "Send test email" with wrong credentials shows the SMTP error in the modal
  and writes a `failed` row to `digest_log`.
- "Send daily now" delivers a `[Test]` email and does not prevent the
  scheduled daily from sending later that day.
- With Show dollar values off, neither email contains a dollar amount.
- With Skip quiet days on and a flat day with no alerts or dividends, no
  daily is sent, the snapshot is still written, and Last sent shows
  "skipped".
- Restarting the container after a send does not send again that day.
- Stopping the container over 17:00 and starting it at 19:00 sends the daily
  once; starting it the next morning does not.
- `GET /api/settings/digest` never contains the password.
- Backup export contains `settings` without `smtp.pass`, and
  `portfolio_snapshots`; import restores both.
- `npm run build` and `npm run lint` clean; `npm test` green.
