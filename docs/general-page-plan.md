# General page: glance row + promoted/demoted markets

Implementation plan. Decisions below were made in discussion and are settled;
do not re-open them. Follow the design-token rules in `CLAUDE.md` throughout.
Do not commit.

## Goal

The General tab currently renders one `Markets` panel containing 23 identical
cards in a ragged four-column grid. It has no hierarchy and nothing that
identifies it as the home page. This change:

1. Adds a four-tile **glance row** above the Markets panel.
2. Keeps **four headline indices as cards** and demotes the other 19 symbols
   to **compact table rows**.
3. Removes the red "Markets closed" dot from the panel header (the glance row
   replaces it).

Explicitly **out of scope**: any portfolio data on this page. Portfolios have
their own tab.

## Settled decisions

- Glance tiles, left to right: **Market status**, **Watchlist gainer**,
  **Watchlist loser**, **Alerts**.
- Movers come from the **current watchlist**, not from the market symbols.
  Market movers were judged to be noise.
- Headline cards: `^GSPC`, `^GSPTSE`, `^IXIC`, `^DJI`, in that order.
- Demoted symbols render as table rows. The **bell stays visible** in every
  row (iPad is in use, hover-reveal is not acceptable).
- Tiles must render at their final height immediately with placeholder
  content, so the Markets panel below never moves when data lands.
- The tab is renamed **"Markets"**. Label only; the `"general"` key stays.
- The **StockTrax wordmark** becomes a working link to the Markets tab.

## Files

| File | Role |
|---|---|
| `src/app/page.tsx` | Owns watchlist items and watchlist alerts; passes them down |
| `src/components/markets/market-overview.tsx` | Owns market data and market alerts; renders the page |
| `src/components/markets/market-card.tsx` | Headline card, unchanged apart from bell helper |
| `src/components/markets/market-table.tsx` | **New.** Rows for demoted symbols |
| `src/components/markets/market-glance.tsx` | **New.** The four-tile row |
| `src/components/markets/market-status.tsx` | Drop `MarketStatusIndicator`; keep `MarketStatus` (refresh button) |
| `src/components/markets/sparkline.tsx` | Accept a `className`; used smaller in rows |
| `src/lib/markets/symbols.ts` | Add `HEADLINE_SYMBOLS` |
| `src/lib/markets/calendar.ts` | Add `getNextMarketTransition()` |
| `src/components/ui/stat-card.tsx` | Reused as-is for the tiles |

Reference for row styling: `src/components/watchlist/watchlist-table.tsx`
(header cell classes, row hover, mono numbers, bell colour logic).

## Data flow

`page.tsx` already fetches the selected watchlist's quotes on mount regardless
of which tab is active (the effect keyed on `selectedWatchlistId`). So the
movers tile costs **no extra request**. `page.tsx` also holds
`watchlistAlerts`. Market alerts live inside `MarketOverview`.

Add three props to `MarketOverview`:

```ts
watchlistItems: WatchlistItemWithQuote[];
watchlistLoading: boolean;
watchlistAlerts: TriggeredAlertSummary[];
```

`MarketOverview` then has both alert sets and both data sets, and renders the
glance row itself. Nothing else needs lifting.

## 1. Glance row (`market-glance.tsx`)

Grid: `grid grid-cols-2 gap-3 lg:grid-cols-4`, rendered above the `Panel`
inside the existing `space-y-6` wrapper. Each tile is a `StatCard`.

Every tile **always** renders `label`, `value` and `sub`. When data is not yet
available, `value` is an en dash and `sub` is a non-breaking space, so the
tile's height is identical before and after load. Never conditionally omit
`sub`.

### Market status

- `label`: "Market" (NYSE hours drive everything already, keep it simple)
- `value`: "Open" or "Closed", `text-foreground` (neutral, not a status colour)
- `sub`: next transition, e.g. `Closes 4:00 PM ET` / `Opens Mon 9:30 AM ET` /
  `Opens 9:30 AM ET` when it is today
- Recompute on a 60 s interval (`setInterval` in an effect, cleared on
  unmount). No fetch.

Requires a new export in `calendar.ts`:

```ts
export function getNextMarketTransition(date?: Date): { open: boolean; at: Date }
```

Build it from the existing private helpers (`toEasternComponents`,
`getMarketHolidays`, `getEarlyCloseDays`, `isTradingDay`). Early-close days
close at 1:00 PM ET. To construct a `Date` for a given ET wall-clock time,
follow the offset approach used by `toEasternTime` in `src/lib/utils.ts`
rather than assuming a fixed UTC offset. Walk forward day by day (max 10
iterations) to find the next trading day when closed.

### Watchlist gainer / loser

- Source: `watchlistItems` filtered to those with a numeric `changePercent`.
- Gainer is the max, loser the min. If fewer than one item qualifies, show
  the placeholder state.
- `label`: "Watchlist gainer" / "Watchlist loser"
- `value`: formatted percent via `formatPercent`, coloured with
  `getChangeColor`
- `sub`: `SYMBOL · Short name`, truncated with `truncate`
- Click: open `StockDetailsModal` for that symbol (`setDetailsSymbol`, which
  `MarketOverview` already has). Add `cursor-pointer` and `role="button"`.
- While `watchlistLoading` is true and there are no items yet, show
  placeholder. Once items exist, keep showing the last values during a
  refresh (do not flash back to placeholder).

### Alerts

- Count = `watchlistAlerts.length + marketAlerts.length`.
- `label`: "Alerts"
- `value`: the count; when 0 show "None" in `text-muted-foreground`. When > 0
  use `text-warning` (this is the one place `--warning` is allowed per
  `CLAUDE.md`).
- `sub`: up to two triggered symbols joined with ` · `, else a non-breaking
  space. When more than two, append `+N`.
- Click: **always** open the market alerts panel (`setAlertsPanelOpen(true)`
  with no focused symbol). This matches how every bell on this page behaves
  today. Do not route to the watchlist panel from here.

## 2. Headline cards

Add to `symbols.ts`:

```ts
export const HEADLINE_SYMBOLS = ["^GSPC", "^GSPTSE", "^IXIC", "^DJI"] as const;
```

In `MarketOverview`, partition `marketData.markets` into headline (ordered as
above) and the rest. Render the headline four with the existing `MarketCard`
in `grid grid-cols-2 gap-2.5 xl:grid-cols-4`, at the top of `PanelBody`, with
no section heading. The cards are the only thing in the panel that carry the
large price and boxed sparkline, which is what makes them read as promoted.

## 3. Demoted rows (`market-table.tsx`)

Props: `title`, `items: MarketData[]`, plus the same `onClick` /
`onChartClick` / `alertState` / `onAlertClick` callbacks `MarketCard` takes,
keyed by symbol.

Layout below the headline cards, on `lg+` a two-column grid so the tables
balance:

| Left column | Right column |
|---|---|
| Markets (7 remaining indices) | Currency (6) |
| Crypto (3) | Commodities (3) |

Below `lg`, one column in the order Markets, Commodities, Currency, Crypto.

Each `MarketTable` is a `<table className="w-full">` with the category name as
a `<caption>`-style heading using the existing section heading classes
(`text-xs font-medium text-muted-foreground`, left aligned, `mb-2`). Column
header row uses the watchlist table's header cell classes
(`text-[11.5px] font-medium text-muted-foreground`). Columns:

| Column | Cell |
|---|---|
| Name | Name `text-[13px] font-medium text-foreground`, symbol beneath `text-[11px] text-subtle-foreground`. Clicking the name opens details. |
| Price | Right, `font-mono`, formatted with the same rules as `MarketCard.formatPrice` (3 decimals for `=X`, 0 decimals ≥ 10000, else 2). Extract that formatter into a shared helper so card and row agree. If `extendedHours` is present, render `ExtendedHoursLabel` compact beneath, as the watchlist table does. |
| Chg | Right, `font-mono text-[12.5px]`, `getChangeColor` |
| % | Right, same styling |
| Trend | `Sparkline` at `width={56} height={18}`, no border box, wrapped in a button that calls `onChartClick`, `title="View chart"` |
| Bell | Fixed width `w-10`, right aligned, always visible. Same colour logic as `MarketCard`. |

Row: `border-b border-border hover:bg-accent transition-colors`, cells
`px-3 py-2` so a row is about 36px. The whole row is clickable for details
(`cursor-pointer`); the sparkline and bell buttons call `stopPropagation`.

Move the bell colour selection (triggered → `text-negative`, hasRules →
`text-positive`, else subtle) into one small exported helper, e.g.
`alertBellClass(state)` next to `MarketCard`, and use it from both card and
row. Do not touch the watchlist table's copy.

## 4. Header cleanup

- Remove `MarketStatusIndicator` from the `PanelHeader` children and delete
  the component. The red/green dot goes with it.
- Keep `meta="Indices, commodities, currency & crypto"` and the
  `MarketStatus` refresh control in `right`.

## 5. Loading and empty states

- Glance tiles: placeholder rule above. They never unmount.
- Markets panel: keep the existing centered "Loading market data…" block for
  the first load. During a refresh, keep the existing content rendered and
  rely on the refresh button's spinner, which is current behaviour.
- Empty watchlist: gainer/loser tiles show the placeholder with `sub`
  "No watchlist symbols" (still one line, so no height change).

## Acceptance

- Load the General tab with the network throttled. The Markets panel does not
  move vertically when the tiles populate.
- Four headline cards, then two balanced columns of tables on a wide window.
  No orphan cards anywhere.
- Every row has a visible bell; its colour matches the card logic.
- Clicking a row opens details, clicking its sparkline opens the chart modal
  at that symbol, clicking its bell opens the market alerts panel focused on
  that symbol. Same as the cards today.
- Gainer/loser tiles match the top and bottom of the Watchlists tab sorted by
  Chg %.
- Alerts tile count equals the header badge count plus any market alerts.
  Clicking it opens the market alerts panel every time.
- First tab reads "Markets"; the settings default-tab picker shows the same
  label; `/?tab=general` still lands there.
- Clicking the wordmark from the dashboard switches to Markets; from a
  portfolio page it navigates to the dashboard on the Markets tab.
- `npm run lint` and `npm run build` pass.
- Light and dark themes both checked; no hard-coded colours added. While
  touching `sparkline.tsx`, replace its hard-coded `#22c55e` / `#ef4444`
  stroke with `var(--positive)` / `var(--negative)`. Both variables are
  defined for light and dark in `globals.css`, and the current hex values do
  not match either theme.

## 6. Header: tab label and wordmark

Both in `src/components/layout/app-header.tsx`.

**Tab label.** Change the visible text of the first tab from "General" to
"Markets". Keep the `Tab` key `"general"` everywhere: it is the URL param
(`/?tab=general`), the stored default-tab setting, and a key in
`src/lib/backup/settings-registry.ts`. Changing the key would break saved
settings and backups for no benefit. Also update the label in the default-tab
picker in `src/components/settings/general-settings-modal.tsx` (the
`TAB_OPTIONS` entry whose value is `"general"`) so the two agree.

**Wordmark.** The `StockTrax` wordmark is a Next `Link` to `/`. On the
dashboard that is the current route, so clicking it does nothing, and even
on a sub page it lands on whatever the stored default tab is rather than
Markets. Replace the `Link` with a `button` that calls
`handleTabClick("general")`, which already handles both cases: on the
dashboard it switches the tab in place, on a sub page it navigates to
`/?tab=general`. Keep the existing classes and the accent square. Add
`aria-label="StockTrax home"`.
