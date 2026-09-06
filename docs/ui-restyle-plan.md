# StockTrax UI restyle — implementation plan

Status: **approved in principle, not started.** Execute phase by phase on a branch
(`ui/restyle`). Do **not** commit or push unless the user explicitly asks (CLAUDE.md rule).

## 0. Why, and what "done" looks like

The app's information design is good (dense tables, range bars, period-return row,
extended-hours labels, dark default). The *chrome* reads as generated: blue→purple
gradients, per-tab rainbow colouring, icon-in-a-tinted-square before every heading,
`rounded-2xl` + `shadow-2xl` + `backdrop-blur` everywhere, a marketing tagline in the
app header, 130+ hand-pasted inline SVG icon paths, and 90+ hard-coded `text-white`
classes that break light mode.

Target look (reference, same data as the live page):

- `docs/mockups/portfolio-restyle.html` — static mockup of `/portfolio/[id]`
- `docs/mockups/portfolio-restyle.png` — render of the above at 1280×1000
- `docs/mockups/portfolio-before.png` — the live page today, same viewport

In one sentence: **flat surfaces, one accent colour, colour reserved for data, numbers as
tabular text, one 52px header row, no decorative icons.** In the same 1280×1000 viewport
the mockup shows 12 holdings rows where the current page shows 4.

This is a **styling and layout** change only. No data, API, calculation, or state-logic
changes. Every feature that exists today must still exist and behave identically.

### Non-goals
- No new features, no chart library changes, no dependency additions (lucide-react and
  radix-ui are already installed).
- Not a full responsive redesign. Mobile only needs to stop breaking (Phase 11).
- Keep Geist / Geist Mono. Keep the `StockIcon` company logos (shrink them).

### How to verify as you go
- Dev server: `npm run dev` (a `.claude/launch.json` entry `stocktrax-dev` exists for the
  browser pane).
- Screenshot to a file (headless WKWebView, no Chrome needed):
  `xcrun swift docs/mockups/snap.swift http://localhost:3000/portfolio/2 out.png 1280 1000 12`
  (last arg = seconds to wait for client-side fetches; use `1.5` for static pages).
- Light mode: the app stores `theme` in `localStorage`; toggle via the sun/moon button
  (`aria-label="Switch to light mode"`). Screenshot both themes at the end of every phase
  that touches a screen.
- `npm run lint` and `npm run build` must pass at the end of every phase.
- Test data: portfolio id **2** ("Dividend Portfolio", 20 holdings), one watchlist with 7
  symbols. `/portfolio/1` does not exist.

---

## 1. Design spec

### 1.1 Tokens (put in `src/app/globals.css`)

Keep the shadcn token *names* (components already reference `bg-card`,
`text-muted-foreground`, etc. in `src/components/ui/*`), change their *values*, and add a
few semantic ones. Values below are what the mockup uses.

| Token | Dark | Light | Used for |
|---|---|---|---|
| `--background` | `#0c0e12` | `#f6f7f9` | page |
| `--card` / `--popover` | `#13161b` | `#ffffff` | cards, panels, dropdowns, modals |
| `--muted` | `#181c22` | `#eef0f3` | segmented-control track, subtle fills |
| `--accent` | `#1c2129` | `#e7eaee` | hover fills, active segment |
| `--border` | `rgba(255,255,255,.08)` | `rgba(0,0,0,.09)` | all dividers |
| `--border-strong` *(new)* | `rgba(255,255,255,.14)` | `rgba(0,0,0,.16)` | outline buttons, focused controls |
| `--foreground` | `#e6e8eb` | `#15181d` | primary text |
| `--muted-foreground` | `#8b919a` | `#616872` | labels, secondary text |
| `--subtle-foreground` *(new)* | `#5c626b` | `#8a9099` | tertiary text, disabled icons |
| `--primary` | `#4f8ff7` | `#2f6fe0` | the one accent: active tab underline, primary button, links |
| `--primary-foreground` | `#ffffff` | `#ffffff` | |
| `--ring` | `#4f8ff7` | `#2f6fe0` | focus |
| `--positive` *(new)* | `#2fb37a` | `#1f9d63` | gains, up moves |
| `--negative` *(new)* | `#e5544b` | `#d5453c` | losses, down moves, destructive |
| `--destructive` | = `--negative` | = `--negative` | |
| `--warning` *(new)* | `#d9a441` | `#b8860b` | alert badges/banners only |
| `--radius` | `0.5rem` | | cards `rounded-lg` (8px), controls `rounded-md` (6px) |
| `--chart-1..5` | `#4f8ff7 #3bb8a5 #8b7cf6 #d9a441 #e0637a` | same | recharts/allocation series |

Expose the new ones to Tailwind in the existing `@theme inline` block:
`--color-border-strong`, `--color-subtle-foreground`, `--color-positive`,
`--color-negative`, `--color-warning`. That yields `text-positive`, `bg-positive/10`,
`border-border-strong`, `text-subtle-foreground`, etc.

Also in `globals.css`:
- `body { font-variant-numeric: tabular-nums; }` (global; harmless for prose).
- Keep `@keyframes bell-ring` (it's a functional alert signal), but it's the *only*
  decorative animation that survives.
- Delete the sidebar-* tokens if nothing references them (grep first).

### 1.2 Type scale
- Body 13px (`text-[13px]`), table cells 12.5px mono, table headers 11.5px sentence case
  muted, stat labels 12px muted, stat values 20px semibold, page title 18px semibold,
  wordmark 15px semibold. `tracking-tight` only on the wordmark and page title.
- **No `uppercase tracking-wider` anywhere.** Table headers are sentence case.
- Weights: 500 for labels/tabs, 600 for values/titles. Retire `font-bold` (700) except the
  wordmark if it needs it.

### 1.3 Colour rules
- Interactive accent = `primary` only. No second accent, no per-section hues.
- Green/red **only** on numeric change values and their sign, via `getChangeColor`.
- Amber/`warning` only for alert count badges and the "alerts triggered" banner.
- Icons are monochrome: `text-muted-foreground` at rest, `text-foreground` on hover.
- Charts use `--chart-*`.

### 1.4 Surfaces & motion
- Page: flat `bg-background`. No body gradient, no SVG noise overlay.
- Card/panel: `rounded-lg border border-border bg-card`. No gradient fills, no
  `shadow-*` on static cards, no `backdrop-blur`.
- Dropdown/popover: `rounded-md border border-border bg-popover shadow-md`.
- Modal: overlay `bg-black/60`; surface `rounded-lg border border-border bg-card shadow-xl`.
- Hover: background fill (`hover:bg-accent`) or text colour change only. No
  `hover:scale-*`, no glow `drop-shadow`, no `shadow-lg` on active states.
- `transition-colors` (not `transition-all`) where a transition is wanted at all.

### 1.5 Icons
`lucide-react` only, `size-4` default (`size-3.5` inside tables), `strokeWidth={1.75}`.
Remove all decorative "icon badge" tiles (`w-8 h-8 rounded-lg bg-*-500/20` + svg) in
front of titles — 32 instances. Keep icons that *are* the control (bell, trash, settings,
refresh, chevron, back arrow, external link, info).

---

## 2. Phases

Each phase ends with lint + build + screenshots (dark and light). Phases 1–3 unlock
everything else; 4–10 can be re-ordered if convenient.

### Phase 1 — Foundation (`globals.css`, `layout.tsx`, `utils.ts`)
1. `src/app/globals.css`: apply §1.1 values, add the new tokens to `@theme inline`,
   add the body `tabular-nums` rule.
2. `src/app/layout.tsx`: body class becomes `${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`
   (base layer already applies `bg-background text-foreground`). **Delete** the
   `fixed inset-0 bg-[url('data:image/svg+xml...')]` overlay div and the `relative`
   wrapper.
3. `src/lib/utils.ts`: `getChangeColor` returns `"text-positive"` / `"text-negative"`
   (28 call sites pick this up automatically). Remove `getChangeBgColor` (0 call sites).
4. Verify: page renders flat; nothing else should visibly change yet.

### Phase 2 — Mechanical class migration (codemod)
31 files use `light dark:` pairs. Replace them with tokens so light mode comes for free
and class strings halve in length. Write a one-off `scripts/restyle-codemod.mjs` (Node,
ordered `[from, to]` string replacements over `src/**/*.tsx`), run it once, review the
diff by hand, then delete the script (or leave it out of the commit).

Ordered replacements (longer/more specific first — order matters):

| From | To | Count |
|---|---|---|
| `hover:text-black dark:hover:text-white/80` | `hover:text-foreground` | 10 |
| `hover:text-black dark:hover:text-white` | `hover:text-foreground` | 53 |
| `hover:bg-black/10 dark:hover:bg-white/10` | `hover:bg-accent` | 26 |
| `hover:bg-black/5 dark:hover:bg-white/5` | `hover:bg-accent` | 44 |
| `hover:border-black/20 dark:hover:border-white/20` | `hover:border-border-strong` | 7 |
| `text-black/70 dark:text-white/70` | `text-foreground/80` | 33 |
| `text-black/60 dark:text-white/60` | `text-muted-foreground` | 50 |
| `text-black/50 dark:text-white/50` | `text-muted-foreground` | 140 |
| `text-black/40 dark:text-white/40` | `text-subtle-foreground` | 36 |
| `text-black/30 dark:text-white/30` | `text-subtle-foreground` | 19 |
| `text-black/20 dark:text-white/20` | `text-subtle-foreground/70` | 5 |
| `text-black dark:text-white` | `text-foreground` | 91 |
| `border-black/20 dark:border-white/20` | `border-border-strong` | 8 |
| `border-black/30 dark:border-white/30` | `border-border-strong` | 3 |
| `border-black/10 dark:border-white/10` | `border-border` | 116 |
| `border-black/5 dark:border-white/5` | `border-border` | 5 |
| `bg-black/10 dark:bg-white/10` | `bg-accent` | 6 |
| `bg-black/5 dark:bg-white/5` | `bg-muted` | 52 |
| `bg-black/[0.02] dark:bg-white/[0.02]` | *(delete — zebra striping goes; rows use dividers + hover)* | 12 |
| `placeholder-black/30 dark:placeholder-white/30` | `placeholder:text-subtle-foreground` | 2 |
| `rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10` | `rounded-lg bg-card border border-border` | 22 |
| same with `rounded-xl` | `rounded-lg bg-card border border-border` | 6 |
| `bg-gradient-to-r from-<hue>-500/10 to-transparent` (panel header strips, 7 hues) | *(delete)* | 18 |
| `bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-xl shadow-2xl` | `bg-popover border border-border rounded-md shadow-md` | 3 |
| `transition-all` | `transition-colors` | 105 |
| `text-emerald-400` / `text-emerald-500` used for gains | `text-positive` | ~90 |
| `text-red-400` / `text-red-500` used for losses | `text-negative` | ~70 |
| `text-amber-*` (alert semantics) | `text-warning` | ~36 |
| `hover:scale-105`, `hover:drop-shadow-[...]`, `shadow-lg`, `shadow-xl`, `shadow-2xl`, `backdrop-blur-*` | *(delete)* | ~40 |

Then hand-fix what the codemod can't:
- Modal-internal dark-only classes: `text-white/70`, `text-white/50`, `text-white/40`,
  `border-white/10`, `bg-white/5`, `from-white/5 to-white/[0.02]`, `from-gray-900 …`
  → `text-muted-foreground`, `text-subtle-foreground`, `border-border`, `bg-muted`,
  `bg-card`. Files: `stock-details-modal.tsx` (41), `portfolio/[id]/page.tsx` (39),
  `data-settings-modal.tsx` (27), `price-chart-modal.tsx` (9), `add-symbol-form.tsx` (7),
  `csv-import-modal.tsx` (7), `general-settings-modal.tsx` (6), `portfolio-stats.tsx` (6),
  `add-transaction-form.tsx` (6), `screen-editor.tsx` (4), `price-chart.tsx` (4), `page.tsx` (4).
- Remaining `text-blue-400/500`, `text-violet-*`, `text-purple-*`, `text-cyan-*`,
  `text-sky-*`, `text-indigo-*`, `text-orange-*` on icons/titles → `text-muted-foreground`
  (most of these disappear with the icon badges in Phase 9 anyway).
- `bg-blue-500 text-white` active sub-tab buttons → the underline tab pattern (§3.3).
- `uppercase tracking-wider` (47) → remove; let §3 table-header class own header styling.

Gate before leaving Phase 2 (all must be zero):
`grep -rn "dark:text-white\|dark:bg-white\|dark:border-white\|bg-gradient\|backdrop-blur\|shadow-2xl\|tracking-wider\|transition-all\|hover:scale" src --include='*.tsx'`

### Phase 3 — Shared primitives (new files in `src/components/ui/`)
Build these first, then use them in Phases 4–10. Exact class strings in §3.

| File | Exports | Replaces |
|---|---|---|
| `stat-card.tsx` | `StatCard` | the two divergent `StatCard`s in `portfolio-stats.tsx:78` and `portfolio/[id]/page.tsx` (~line 597), plus the period-returns mini-cards |
| `panel.tsx` | `Panel`, `PanelHeader`, `PanelTabs`, `PanelBody` | the `rounded-2xl … overflow-hidden` + header-strip + sub-tab pattern used in `page.tsx` (watchlist), `portfolio/[id]/page.tsx` (holdings), `market-overview.tsx`, `portfolio-summary-list.tsx`, `screen-content.tsx` |
| `segmented.tsx` | `Segmented` | the `p-1 rounded-xl bg-black/5` button groups (`page.tsx` view tabs, portfolio Holdings/Performance toggle, `price-chart.tsx:559` range buttons) |
| `change-value.tsx` | `ChangeValue` | every "coloured amount + coloured % underneath, sometimes in a pill" cell |
| `modal.tsx` | `Modal` (overlay + surface + close button + title slot) | the six hand-rolled `fixed inset-0` containers: `stock-details-modal`, `price-chart-modal`, `csv-import-modal`, `data-settings-modal`, `general-settings-modal`, `alerts-panel` |
| `table.tsx` (existing, unused) | either adopt it or delete it — don't leave both | |

Also delete `src/components/ui/card.tsx` and `tabs.tsx` if still unused after Phase 10
(they have 0 imports today).

### Phase 4 — App header (`main-nav.tsx` → `app-header.tsx`)
Today `MainNav` (logo tile, gradient wordmark, tagline, actions) and `MainNavTabs`
(pill tab bar with per-tab gradients + three dropdowns) are two stacked blocks (~230px
with the page title). Target: **one 52px row** (§3.1). Both `src/app/page.tsx` and
`src/app/portfolio/[id]/page.tsx` render them; both get the new component.

1. Rename/refactor `src/components/layout/main-nav.tsx` → `app-header.tsx` exporting
   `AppHeader` with the merged props of `MainNav` + `MainNavTabs`. Keep every piece of
   behaviour: tab switching, default-tab preference, the three dropdowns with
   create/rename/delete, `isSubPage` routing, alert bell with count + `bell-ring`, theme
   toggle, `SettingsMenu`.
2. Remove: logo tile, gradient-clipped `<h1>`, tagline `<p>`, per-tab icons and per-tab
   gradient active states.
3. The watchlist tab currently injects `<AddSymbolForm compact />` as `children` of the
   tab bar. Move it to the watchlist `PanelHeader` right slot in `page.tsx` (next to
   "Updated …" + Refresh). Its gradient "Add" button becomes `<Button size="sm">`.
4. Dropdown panels use the popover surface (§1.4). Row hover `hover:bg-accent`. Active
   item `text-foreground font-medium` + a `Check` icon, not a coloured background.
5. Page content wrapper on both pages: `container mx-auto py-8 px-4` →
   `mx-auto max-w-[1280px] px-6 py-5`.

### Phase 5 — Dashboard tab content (`page.tsx`, `markets/*`, `portfolio-summary-list.tsx`, `portfolio-stats.tsx`)
- Watchlist panel → `Panel` + `PanelHeader title="Watchlist" meta="7 symbols"` +
  `PanelTabs` (Performance / Dividend / Insider / News) + right slot (AddSymbolForm,
  updated label, Refresh). Delete the `w-8 h-8 rounded-lg bg-blue-500/20` icon tile.
- Alerts banner: `rounded-md border border-warning/30 bg-warning/10 text-foreground`,
  keep content.
- Empty states (`No Watchlist Selected`, `No Screen Selected`): drop the 64px icon tile;
  `text-sm font-medium` title + `text-muted-foreground` line, 48px vertical padding.
- `market-overview.tsx`: one `Panel`; section labels ("Markets", "Commodities", …)
  become `text-xs font-medium text-muted-foreground` with no coloured dot; status pill
  ("Markets closed") keeps its small dot in `bg-negative`/`bg-positive`.
- `market-card.tsx`: `rounded-md border border-border bg-card p-3 hover:border-border-strong`;
  remove the green/red gradient background, the sparkline's `hover:scale-105` and glow.
  Name `text-sm font-medium`, symbol `text-xs text-subtle-foreground`, price `text-lg
  font-semibold`, change via `ChangeValue`.
- `portfolio-summary-list.tsx`: remove the emerald briefcase tile; the row is a plain
  table row; year columns via `ChangeValue`.
- `portfolio-stats.tsx`: use the shared `StatCard`; period-returns row uses `StatCard
  size="sm"`; breakdown chart cards are `Panel`s without icon badges; pie/bar colours from
  `--chart-*`. Check the donut charts render at a sane size (they looked collapsed in a
  hidden-pane capture — verify in a visible browser; if `ResponsiveContainer` measures 0
  inside `flex lg:w-1/2`, give the chart wrapper an explicit `min-h`/`h-[200px]`).

### Phase 6 — Portfolio page shell (`src/app/portfolio/[id]/page.tsx`)
- Title row (§3.2): `ArrowLeft` link, `h1` name, `CAD · created Sep 18, 2024` meta. Delete
  the emerald briefcase tile and the round back button.
- Stat cards: use shared `StatCard` (`grid grid-cols-2 md:grid-cols-5 gap-2.5`).
- **Decision (default = fold):** the outer "Holdings | Performance" gradient toggle and
  the inner "Holdings | Performance | Dividend | …" sub-tabs both exist and both have a
  "Performance" entry that means different things (outer = `PortfolioStats` charts,
  inner = `PortfolioPerformanceTable`). Default: delete the outer toggle and add
  `PortfolioStats` as the **first** inner tab named **"Overview"**, so
  `holdingsView` becomes `"overview" | "holdings" | "performance" | …` and
  `activeTab` state goes away. Alternative if the user prefers: keep both levels, rename
  the outer "Performance" to "Overview" and style it as `Segmented`.
- Holdings panel → `Panel`/`PanelHeader`/`PanelTabs`; delete the icon tile; "Your
  Holdings" → "Holdings" with `20 positions` meta.
- Transactions toolbar buttons ("Add transaction", "Import CSV") → `<Button
  variant="outline" size="sm">` with lucide `Plus` / `Upload`.
- Loading state: `Loader2` spin + muted text; "Portfolio Not Found": plain title, muted
  text, `<Button variant="outline">` back link — no red icon tile, no gradient button.

### Phase 7 — Tables
Files: `holdings-table.tsx`, `watchlist-table.tsx`, `portfolio-performance-table.tsx`,
`portfolio-dividend-table.tsx`, `dividend-table.tsx`, `dividend-returns-table.tsx`,
`insider-table.tsx`, `portfolio-insider-table.tsx`, `transactions-table.tsx`,
`news-table.tsx`, `screen-results.tsx`.

Common treatment (§3.4):
- `th`: `px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground text-right
  first:text-left whitespace-nowrap border-b border-border select-none` + sort arrow
  `ArrowUpDown`/`ArrowUp`/`ArrowDown` size-3 at `text-subtle-foreground`.
- `td`: `px-3.5 py-2 text-right font-mono text-[12.5px] whitespace-nowrap border-b
  border-border` (last row no border); row `hover:bg-accent/40`; no zebra.
- Symbol cell: `StockIcon` at 20px, symbol `font-sans text-[13px] font-semibold
  text-foreground` (a `<button>` that opens the details modal — keep it a button but
  drop the blue underline/link styling; hover `text-primary`), company name
  `text-[11.5px] text-subtle-foreground truncate max-w-[190px]` (was `text-white/40`,
  invisible in light mode).
- Secondary numeric columns (shares, avg cost, % of portfolio) `text-muted-foreground`.
- Every "amount + % beneath" cell → `<ChangeValue amount pct currency />`. **No pills.**
  Keep the currency prefix that `formatCurrency` already emits (mixed-currency
  portfolios exist; the mockup dropped it only for cleanliness).
- Row action icons (`Bell`, `Trash2`) `size-3.5 text-subtle-foreground hover:text-foreground`;
  triggered-alert bell `text-negative` + `bell-ring`; has-rules bell `text-positive`.
- Range bars (`price-range-bar.tsx`): keep, but track `bg-muted`, marker `bg-primary`,
  hi/lo labels `text-[10.5px] text-subtle-foreground` — no green→red gradient track.
- Per-row context menus/popovers use the popover surface.
- `watchlist-table.tsx` specifically: it has 11 columns + actions and every column has
  equal weight. Apply the muted treatment to 5D/1M/3M/1Y/5Y (`ChangeValue`, no pills) and
  make Price + Chg% the only bold cells. Keep the column set.

### Phase 8 — Modals and side panels
- Build `Modal` (§3.5) and migrate all six containers. Consistent close button
  (`X` icon, top-right), consistent `max-w`, `overflow-y-auto` on the surface.
- `stock-details-modal.tsx`: the `Section` helper (line 166) keeps its API but renders
  a flat `Panel` — header `px-4 py-2.5 border-b border-border text-sm font-semibold`,
  **no `color` gradient strip, no icon** (remove the `icon`/`color` props and their 25
  inline SVGs). Header stat strip (Market Cap / P/E / Yield / Beta) → `StatCard
  size="sm"`. "About" and "Recent news" section titles lose `uppercase tracking-wider`.
  News rows: thumbnail 40px `rounded`, title `text-sm`, source/time
  `text-xs text-subtle-foreground`, `ExternalLink` icon.
- `price-chart-modal.tsx` / `price-chart.tsx`: range buttons (1D/5D/3M/1Y) and
  line/candle toggle → `Segmented`; legend text tokens; chart colours: series
  `--primary`, up/down candles `--positive`/`--negative`, grid `--border`.
- `csv-import-modal.tsx`, `add-transaction-form.tsx`, `general-settings-modal.tsx`,
  `data-settings-modal.tsx`: gradient submit buttons → `<Button>`; inputs use
  `src/components/ui/input.tsx` (already token-based); step indicators/badges →
  `bg-muted text-muted-foreground`, active step `bg-primary text-primary-foreground`.
- `alerts-panel.tsx` (slide-over): surface `bg-card border-l border-border`; rule cards
  `rounded-md border border-border`; triggered state `border-negative/40 bg-negative/5`.
- `settings-menu.tsx`: the three header icon buttons → `<Button variant="ghost"
  size="icon-sm">` with lucide `Bell`, `Sun`/`Moon`, `Settings`.

### Phase 9 — Icons
Replace every inline `<svg …><path d="…"/></svg>` with lucide. Mapping for the paths
that appear in the codebase:

| Inline path (heroicon) | lucide |
|---|---|
| trending-up `M13 7h8m0 0v8…` | `TrendingUp` (only survives if a tab keeps an icon — default: no tab icons) |
| bell `M15 17h5l-1.405…` | `Bell` |
| cog | `Settings` |
| sun / moon | `Sun` / `Moon` |
| refresh `M4 4v5h.582…` | `RefreshCw` |
| chevron-down `M19 9l-7 7-7-7` | `ChevronDown` |
| arrow-left `M10 19l-7-7…` | `ArrowLeft` |
| plus `M12 6v6m0 0v6…` | `Plus` |
| trash `M19 7l-.867 12.142…` | `Trash2` |
| pencil | `Pencil` |
| check | `Check` |
| x `M6 18L18 6M6 6l12 12` | `X` |
| external-link | `ExternalLink` |
| information-circle | `Info` (in `info-tip.tsx`) |
| exclamation-triangle | `TriangleAlert` |
| upload `M7 16a4 4 0 01-.88-7.903…` | `Upload` |
| download | `Download` |
| search | `Search` |
| eye (Watchlists tab) / briefcase (Portfolios) / funnel (Screens) / globe (General) | drop — no tab icons |
| chart-bar, chart-pie, currency, building, clipboard, users, calendar, newspaper (section badges) | drop — no section icons |
| spinner divs (`border-2 … rounded-full animate-spin`, 20) | `<Loader2 className="size-4 animate-spin text-muted-foreground" />` |

Keep inline SVG only where it *is* the graphic: `sparkline.tsx`, `price-range-bar.tsx`,
`stock-icon.tsx`, chart code.

Gate: `grep -rn "<svg" src --include='*.tsx'` returns only those files.

### Phase 10 — Buttons, forms, badges
- Every gradient button (`from-blue-500 to-purple-500`, `to-indigo-500`,
  `from-amber-500 to-orange-500`) → `<Button>` (`default` = solid `primary`, `outline`,
  `ghost`, `destructive`). Remove per-call-site overrides of the outline variant
  (`page.tsx` Refresh button passes 6 hover classes — delete them).
- Type badges (ETF / STOCK / exchange) → `rounded px-1.5 py-0.5 text-[10.5px] font-medium
  bg-muted text-muted-foreground`. Alert-count badge stays `bg-warning text-black`.
- `add-symbol-form.tsx` search: `Input` + `Search` icon; suggestions list = popover
  surface; highlighted row `bg-accent`.
- `screen-editor.tsx`: filter chips `rounded-md border border-border bg-muted`;
  operators/inputs use `Input`.

### Phase 11 — Light mode + mobile minimum
- Light mode walk-through of every screen and modal. Anything still hard-coded to
  white/black shows up here. Gate: `grep -rn "text-white\b\|text-black\b\|bg-white\b\|bg-black\b" src --include='*.tsx'`
  should return only intentional cases (overlay `bg-black/60`, `text-primary-foreground`
  equivalents) — rewrite the rest.
- Mobile: `AppHeader` wraps to two rows below `md` (wordmark + actions, then tabs in an
  `overflow-x-auto` strip); stat grids `grid-cols-2 md:grid-cols-5`; `PanelHeader` stacks
  title/tabs/right-slot below `md`; tables stay in `overflow-x-auto` wrappers. Nothing more.

### Phase 12 — Cleanup and final verification
- Remove now-unused: `card.tsx`, `tabs.tsx`, `table.tsx` (unless adopted), the `sidebar-*`
  tokens, `getChangeBgColor`, `scripts/restyle-codemod.mjs`, any dead `color`/`icon` props.
- Run all gates from Phases 2, 9, 11; `npm run lint`; `npm run build`.
- Screenshots (dark + light, 1280×1000) of: dashboard General, Watchlist (Performance +
  News views), Portfolios tab, `/portfolio/2` (Overview + Holdings + Transactions),
  stock-details modal, price-chart modal, CSV import modal, settings modal, alerts panel,
  Screens tab. Put them in `docs/mockups/after/` for the PR (or delete before commit —
  the PNGs are a few MB).
- Update `CLAUDE.md` "Project Structure" for renamed/added files (`layout/app-header.tsx`,
  `ui/stat-card.tsx`, `ui/panel.tsx`, `ui/segmented.tsx`, `ui/change-value.tsx`,
  `ui/modal.tsx`) and add a short "Design tokens" note pointing at §1.

---

## 3. Component specs

Class strings are the contract with the mockup; adjust spacing only if something
visibly misaligns.

### 3.1 `AppHeader`
```tsx
<header className="h-[52px] border-b border-border bg-background">
  <div className="mx-auto flex h-full max-w-[1280px] items-center gap-7 px-6">
    <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <span className="size-2 rounded-[2px] bg-primary" />StockTrax
    </Link>
    <nav className="flex h-full gap-0.5">
      {/* one per tab; dropdown tabs wrap the trigger + chevron in the same element */}
      <button data-active={active} className="flex h-full items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground hover:text-foreground data-[active=true]:border-primary data-[active=true]:text-foreground">
        Portfolios <ChevronDown className="size-3 opacity-60" />
      </button>
    </nav>
    <div className="ml-auto flex gap-1">{/* Bell / Sun|Moon / Settings as Button variant="ghost" size="icon-sm" */}</div>
  </div>
</header>
```

### 3.2 Page title row (portfolio page)
```tsx
<div className="mb-4 flex items-center gap-2.5">
  <Link href="/" aria-label="Back to dashboard" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /></Link>
  <h1 className="text-lg font-semibold tracking-tight">{portfolio.name}</h1>
  <span className="text-xs text-subtle-foreground">{portfolio.currency} · created {formatDate(portfolio.createdAt)}</span>
</div>
```

### 3.3 `StatCard`, `Panel`, `PanelTabs`, `Segmented`
```tsx
// StatCard: size "md" (default) | "sm" (period-returns row, modal header strip)
<div className="rounded-lg border border-border bg-card px-3.5 py-3">
  <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">{label}{tip && <InfoTip … />}</div>
  <div className={cn("text-xl font-semibold tracking-tight", size === "sm" && "text-base", valueClass)}>{value}</div>
  {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
</div>

// Panel / PanelHeader / PanelTabs / PanelBody
<section className="overflow-hidden rounded-lg border border-border bg-card">
  <div className="flex h-11 items-center gap-5 border-b border-border px-4">
    <div className="text-sm font-semibold">{title}{meta && <span className="ml-1.5 font-normal text-subtle-foreground">{meta}</span>}</div>
    <div className="flex h-full gap-0.5">   {/* PanelTabs */}
      <button data-active className="-mb-px flex items-center border-b-2 border-transparent px-2.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground data-[active=true]:border-primary data-[active=true]:text-foreground">Holdings</button>
    </div>
    <div className="ml-auto flex items-center gap-3 text-xs text-subtle-foreground">{right}</div>
  </div>
  <div>{children}</div>               {/* PanelBody: tables go edge-to-edge; use p-4 for non-table content */}
</section>

// Segmented (Holdings|Performance toggle, chart range buttons, view switches)
<div className="inline-flex rounded-md border border-border bg-muted p-0.5">
  <button data-active className="rounded px-3 py-1 text-sm font-medium text-muted-foreground data-[active=true]:bg-card data-[active=true]:text-foreground data-[active=true]:shadow-[inset_0_0_0_1px_var(--border-strong)]">Holdings</button>
</div>
```

### 3.4 Table cells and `ChangeValue`
```tsx
// ChangeValue: signed amount + signed % underneath, coloured by sign, no pill
<span className={cn("font-mono text-[12.5px]", getChangeColor(amount))}>
  {formatSigned(amount, currency)}
  <span className="mt-px block text-[11px] opacity-85">{formatSignedPercent(pct)}</span>
</span>
```
`th`/`td` classes in Phase 7. Use a real minus sign (U+2212) or the existing `-`
consistently — pick one in `formatSigned` and use it everywhere.

### 3.5 `Modal`
```tsx
<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-6" onClick={onClose}>
  <div role="dialog" aria-modal className={cn("w-full rounded-lg border border-border bg-card shadow-xl", maxW ?? "max-w-4xl")} onClick={e => e.stopPropagation()}>
    <div className="flex items-start justify-between gap-4 px-5 pt-4">{title}{/* X button: Button ghost icon-sm */}</div>
    <div className="px-5 pb-5">{children}</div>
  </div>
</div>
```
Escape-to-close and body scroll lock: keep whatever each modal does today; if none do,
add Escape handling in `Modal` once.

---

## 4. Decisions (defaults confirmed by the user on 2026-09-06 — do not re-ask)

| Decision | Default | Alternative |
|---|---|---|
| Outer Holdings/Performance toggle on the portfolio page | Fold `PortfolioStats` into an "Overview" sub-tab; delete the toggle | Keep both levels, rename outer "Performance" → "Overview" |
| Currency prefixes inside table cells | Keep (`C$`, `US$`) | Drop for single-currency portfolios, show in panel meta |
| Company logos in tables | Keep, 20px | Remove |
| Zebra striping | Remove | Keep as `bg-muted/40` |
| Tab icons in the header | None | Monochrome lucide at `size-3.5` |
| Mobile | Minimum: nothing breaks | Full responsive pass (separate task) |

## 5. Suggested commit slicing (only when the user asks to commit)
1. `style: flatten theme tokens and remove body gradient` (Phase 1)
2. `style: migrate light/dark class pairs to semantic tokens` (Phase 2)
3. `feat(ui): add StatCard, Panel, Segmented, ChangeValue, Modal primitives` (Phase 3)
4. `refactor: merge MainNav and MainNavTabs into a single AppHeader row` (Phase 4)
5. `style: restyle dashboard tabs and market cards` (Phase 5)
6. `style: restyle portfolio page shell; fold performance into Overview tab` (Phase 6)
7. `style: flatten tables — tabular numbers, no pills, muted secondary columns` (Phase 7)
8. `style: migrate modals to shared Modal; flat sections` (Phase 8)
9. `refactor: replace inline SVG icons with lucide-react` (Phase 9)
10. `style: buttons, badges, forms` (Phase 10)
11. `fix: light-mode contrast and mobile header wrapping` (Phase 11)
12. `chore: remove unused ui primitives and codemod; docs` (Phase 12)
