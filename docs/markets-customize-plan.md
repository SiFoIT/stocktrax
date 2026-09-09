# Customizable Markets sections

Implementation plan. Decisions below were made in discussion and are settled;
do not re-open them. Follow the design-token rules in `CLAUDE.md` throughout.
Do not commit.

## Goal

The four demoted tables on the Markets page (Markets, Commodities, Currency,
Crypto) are hardcoded in `src/lib/markets/symbols.ts`. This change lets the
user pick which rows appear in each table from a curated catalog, capped at 8
per section, with the current rows as the default. Currency pairs can be
flipped (USD/CAD ⇄ CAD/USD). Every catalog entry gets a plain-English
description, shown in full in the picker and in short form under the name in
the table.

Explicitly **out of scope**: free-text symbol entry, drag-to-reorder, choosing
the four headline cards, per-section column changes, anything in the digest.

## Settled decisions

- **Headline cards stay fixed.** `HEADLINE_SYMBOLS` (`^GSPC`, `^GSPTSE`,
  `^IXIC`, `^DJI`) are always fetched and always cards. They never appear in
  the picker. The cap of 8 applies to the rows below them. The existing 7
  non-headline Markets rows are therefore the default exactly.
- **Cap is 8 per section, hard.** Enforced in the picker (unchecked boxes
  disable at 8) and in the API (Zod `max(8)`). Default lists ship at 7 for
  Markets, and keep the current 3 / 6 / 3 for the others; a shorter default is
  fine, the cap is what matters.
- **Curated catalog, not search.** The symbol search API returns equities and
  Yahoo codes for indices, futures and FX are cryptic. The catalog is the
  source of readable names and descriptions.
- **Section heading becomes a button** showing the label plus a `Pencil` icon
  from lucide. Neutral at rest (`text-muted-foreground`), `text-primary` on
  hover and focus. A bare blue heading reads as navigation, so the icon is
  the tell. Click opens the picker on that section's tab.
- **One picker modal, four tabs.** Uses `Modal` and `PanelTabs`. Opens on the
  tab that was clicked; the user can flip to other tabs without closing.
  Save writes all four lists in one request.
- **Selection order is catalog order.** No reordering in v1.
- **Currency entries are pairs, not symbols.** Each is `{ base, quote }`. The
  Yahoo code is derived: `${base}${quote}=X`. Yahoo serves both directions of
  every pair as a real quote (verified: `USDCAD=X`, `CADUSD=X`, `JPYUSD=X`,
  `CADEUR=X` all return their own price). Never compute reciprocals locally.
- **One entry per pair.** A pair occupies one slot in one orientation. The
  default currency list drops `CAD/USD` (reciprocal of `USD/CAD`) and fills
  the freed slot with `AUD/USD`.
- **Flip lives in two places, same action.** A swap icon (`ArrowLeftRight`,
  `size-3.5`) next to each currency row in the picker, and in the table row
  beside the bell. Both flip the orientation and persist it. The description
  flips with it ("Canadian dollars per US dollar" ⇄ "US dollars per Canadian
  dollar").
- **Table sub-line stays short.** The name column is narrow; a full sentence
  under every name doubles row height. The sub-line shows
  `CODE · short`, e.g. `^GSPTSE · Toronto`, `GC=F · COMEX front month`,
  `CAD=X · CAD per USD`. The full description goes on the name's `title`
  attribute and in the picker. Headline cards keep showing the bare code.
- **Existing alert rules follow the row.** Removing a symbol from a section
  does not delete its rules; they stay in the alerts panel with the symbol
  named. Flipping a currency pair does not migrate rules: a rule on `CAD=X`
  keeps evaluating against `CAD=X` data, which the route fetches whenever
  any rule references a symbol not in the visible set (see "Alerts" below).
- **Persistence is one settings key.** `markets.sections`, JSON, server-side,
  via the existing `settings` table and `getSetting` / `setSetting`. No
  schema change. Missing or invalid setting falls back to the defaults.
- **Cache moves to per-symbol keys.** Today quotes and series are cached per
  category (`markets_quotes_${category}`). With user-chosen lists that key
  goes stale on every edit, so cache per symbol instead:
  `markets_quote_${symbol}` and `markets_series_v3_${symbol}_${range}`. A
  picker change or a flip then only fetches the symbols that are new.

## Data model

### `src/lib/markets/catalog.ts` (new)

```ts
export interface CatalogEntry {
  symbol: string;            // Yahoo code as fetched
  name: string;              // "S&P/TSX 60"
  short: string;             // "Toronto" — table sub-line after the code
  description: string;       // "The 60 largest companies on the TSX" — picker + title
  group: string;             // "US" | "Canada" | "Europe" | "Asia-Pacific" | "Metals" | ...
  futures?: { symbol: string; label: string };   // markets only, carried over
}

export interface CurrencyPair {
  base: string;              // "USD"
  quote: string;             // "CAD"
  short: string;             // "CAD per USD"  (derive from orientation)
  description: string;       // "Canadian dollars per US dollar" (derive)
  group: string;             // "Canadian dollar" | "Majors" | "Other"
}

export const CATALOG: {
  markets: CatalogEntry[];
  commodities: CatalogEntry[];
  crypto: CatalogEntry[];
  currency: CurrencyPair[];  // unordered; orientation is the user's choice
};

export const CURRENCY_NAMES: Record<string, string>; // "CAD" -> "Canadian dollar"
export function pairSymbol(base: string, quote: string): string;   // "USDCAD=X"
export function pairEntry(base: string, quote: string): CatalogEntry;
  // builds name "USD/CAD", short "CAD per USD",
  // description "Canadian dollars per US dollar" from CURRENCY_NAMES
export const SECTION_CAP = 8;
```

Catalog contents to start with. Verify each symbol returns a quote from Yahoo
before shipping it; drop any that do not.

- **Markets** (group order US, Canada, Europe, Asia-Pacific, Other):
  Existing 7 non-headline rows plus `^RUT` Russell 2000, `^TX60` S&P/TSX 60,
  `^STOXX50E` Euro Stoxx 50, `^SSMI` SMI, `^IBEX` IBEX 35, `FTSEMIB.MI`
  FTSE MIB, `^AXJO` ASX 200, `^KS11` KOSPI, `^NSEI` Nifty 50, `^TWII`
  Taiwan Weighted, `^BVSP` Bovespa, `^TNX` US 10-year yield.
- **Commodities** (Metals, Energy, Agriculture): existing 3 plus `PL=F`
  Platinum, `PA=F` Palladium, `HG=F` Copper, `BZ=F` Brent, `NG=F` Natural
  gas, `RB=F` Gasoline, `ZC=F` Corn, `ZW=F` Wheat, `ZS=F` Soybeans, `KC=F`
  Coffee, `SB=F` Sugar, `CT=F` Cotton, `LBS=F` Lumber, `LE=F` Live cattle.
- **Currency** (pairs; list each once): USD/CAD, EUR/CAD, GBP/CAD, AUD/CAD,
  JPY/CAD, EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, NZD/USD, USD/MXN,
  USD/CNY, EUR/GBP. Plus `DX-Y.NYB` US Dollar Index as a plain
  `CatalogEntry` in the currency section that has no flip.
- **Crypto**: existing 3 plus `XRP-USD`, `BNB-USD`, `ADA-USD` Cardano,
  `DOGE-USD`, `AVAX-USD` Avalanche, `LINK-USD` Chainlink, `LTC-USD`
  Litecoin, `BTC-CAD` Bitcoin in CAD.

### `src/lib/markets/symbols.ts` (rewritten)

Keeps `Category`, `CATEGORIES`, `CATEGORY_LABELS`, `HEADLINE_SYMBOLS`, and
`MarketSymbol`. `MARKET_SYMBOLS` is replaced by:

```ts
/** What the settings key stores. Currency items are oriented pairs. */
export interface MarketSections {
  markets: string[];                          // catalog symbols
  commodities: string[];
  crypto: string[];
  currency: Array<{ base: string; quote: string } | { symbol: string }>;
}
export const DEFAULT_SECTIONS: MarketSections;
export const marketSectionsSchema: z.ZodType<MarketSections>;
  // each array max(SECTION_CAP), every symbol must exist in CATALOG,
  // every pair must exist in CATALOG.currency in either orientation,
  // no duplicate pair regardless of orientation
/** Resolve stored sections to fetchable entries, headline cards prepended to markets. */
export function resolveSections(sections: MarketSections): Record<Category, MarketSymbol[]>;
```

`MarketSymbol` gains `short` and `description`. `resolveSections` is the one
place headline symbols are prepended, so the route and the UI never disagree
about what is fetched.

### `src/lib/settings.ts`

```ts
export async function getMarketSections(): Promise<MarketSections>;
  // getSetting("markets.sections", null) → parse with marketSectionsSchema
  // → DEFAULT_SECTIONS on null or parse failure
export async function setMarketSections(sections: MarketSections): Promise<void>;
```

## API

### `src/app/api/settings/markets/route.ts` (new)

- `GET` returns `{ sections: MarketSections, catalog: CATALOG, cap: 8 }`. The
  picker loads this once when opened.
- `PUT` body is `MarketSections`, validated by `marketSectionsSchema`.
  Returns the saved value. 400 with the Zod issues on failure.
- `runtime = "nodejs"`, same as the digest settings route.

### `src/app/api/markets/route.ts`

- Read `getMarketSections()` at the top of `GET`, `resolveSections()` it, and
  iterate that instead of `MARKET_SYMBOLS`.
- `fetchQuotes` and `fetchSeries` cache per symbol (see cache decision).
  Keep the category-level `Promise.all` shape; only the cache keys move.
- Response shape unchanged: `Record<Category, MarketData[]>`, but each
  `MarketData` now also carries `short` and `description`. Add both to the
  `MarketData` type in `src/types/index.ts` as optional strings so nothing
  else breaks.
- **Alerts**: after resolving the visible set, load every `alert_rules` row
  with `scope = "market"` and fetch any symbol a rule references that is not
  already in the set. Return those under a fifth key `hidden: MarketData[]`
  so `triggerMarketAlerts` still evaluates them. The UI ignores `hidden` for
  rendering but includes it in the alerts trigger payload and in the alerts
  panel source options. This is what keeps rules alive after a removal or a
  flip. Cheap: these are per-symbol cached quotes.

## UI

### `src/components/markets/market-table.tsx`

- New props: `onEdit?: () => void`, `onFlip?: (symbol: string) => void`.
- Heading: when `onEdit` is set, render a `<button>` containing the label and
  `<Pencil className="size-3.5" />`. Classes:
  `inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary focus-visible:text-primary`.
  `aria-label="Edit {title} rows"`. Otherwise the existing `<h3>`.
- Sub-line under the name: `{data.symbol}{data.short ? ` · ${data.short}` : ""}`
  in the existing `text-[11px] text-subtle-foreground` span. Put
  `title={data.description}` on the name span.
- Render an empty section (`items.length === 0`) instead of returning null
  when `onEdit` is set: heading plus one muted line "No rows. Click the
  heading to add some." Without this a user who unchecks everything has no
  way back.
- Currency rows only: a flip button in the last cell, left of the bell,
  `ArrowLeftRight` at `size-3.5`, same neutral class as an unused bell,
  `aria-label="Show as {quote}/{base}"`, `e.stopPropagation()`. Show it when
  `onFlip` is set and `isCurrencySymbol(data.symbol)` and the symbol is a
  pair (not `DX-Y.NYB`). Decide pair-ness from the catalog, not by string
  parsing.

### `src/components/markets/market-sections-modal.tsx` (new)

- Props: `open`, `initialTab: Category`, `sections: MarketSections`,
  `onClose`, `onSave(sections) => Promise<void>`.
- Fetches `/api/settings/markets` on open for the catalog. Local draft state
  of all four lists; `Save` PUTs and calls `onSave`; `Cancel`/Escape discards.
- Header: title "Markets rows", subtitle "Up to 8 per section. Keep paired
  sections about the same length so the page stays even." `PanelTabs` with
  the four categories; each tab label carries its count, e.g. `Currency 6/8`.
- Body per tab: groups from the catalog as small muted group headings, each
  entry a row with a native checkbox (styled `accent-primary`), then name in
  `text-foreground`, description in `text-muted-foreground text-xs`, and the
  code right-aligned in `font-mono text-subtle-foreground`. Unchecked boxes
  get `disabled` when the tab is at 8, with a one-line note above the list
  "8 of 8 selected" in `text-muted-foreground`. Never `text-warning`; that
  token is for alerts.
- Currency tab: each pair row also has the `ArrowLeftRight` button, which
  swaps `base`/`quote` in the draft and re-derives name, description and code
  in place. Checked or not, the row shows its current orientation.
- Footer: `Reset to defaults` (secondary, left), `Cancel`, `Save` (primary).
  Disable `Save` while the draft equals the saved value or a PUT is in
  flight.
- `maxWidth="max-w-2xl"`, `center`.

### `src/components/markets/market-overview.tsx`

- State: `sections: MarketSections | null`, `editTab: Category | null`.
- Load sections with the first market fetch (one extra `GET
  /api/settings/markets`; or have `/api/markets` also return `sections` to
  save a round trip. Prefer the latter: add `sections` to the markets
  response alongside `hidden`).
- `handleEdit(category)` sets `editTab`. `handleSave(next)` sets `sections`
  and re-fetches market data with `refresh=false` (per-symbol cache makes
  this cheap).
- `handleFlip(symbol)`: find the pair in `sections.currency`, swap it, PUT
  the whole `MarketSections`, then re-fetch. Optimistic is unnecessary; the
  re-fetch is one cached call plus one new symbol.
- `demotedByCategory` and `headlineCards` are unchanged in logic; the
  headline filter still works because `resolveSections` prepends the
  headline symbols to `markets`.
- Alerts: `triggerMarketAlerts([...visible, ...hidden])`;
  `marketSourceOptions` built from the same union so a hidden symbol's rules
  can still be edited. `flatMarketData` for charts uses visible only.

### `src/components/markets/market-card.tsx`

No change. Cards keep name and bare code.

## Alerts detail

`evaluate.ts` matches market rules by `rule.symbol === item.symbol`, so
nothing changes there. The only work is making sure the item list handed to
`triggerMarketAlerts` includes every symbol a market rule references, which
the `hidden` key provides. In the alerts panel, a rule whose symbol is not
visible should still list under its symbol; `sourceOptions` from the union
covers that.

## Tests

Vitest, alongside `src/lib/digest/__tests__`.

- `src/lib/markets/__tests__/symbols.test.ts`:
  - `marketSectionsSchema` rejects a 9th item, an unknown symbol, a pair not
    in the catalog, and the same pair in both orientations.
  - `resolveSections(DEFAULT_SECTIONS)` puts the four headline symbols first
    in `markets` and yields the same symbol set the old `MARKET_SYMBOLS` had,
    minus `CADUSD=X`, plus `AUDUSD=X`.
  - `pairEntry("CAD","USD")` gives symbol `CADUSD=X`, name `CAD/USD`,
    description "US dollars per Canadian dollar".
- Catalog sanity test: no duplicate symbols across the whole catalog; every
  entry has non-empty `short` and `description`; `short` is at most 24
  characters (it has to fit the sub-line).

## Order of work

1. `catalog.ts` and the `symbols.ts` rewrite with `DEFAULT_SECTIONS`,
   schema and `resolveSections`. Tests. Run a one-off script to confirm every
   catalog symbol quotes on Yahoo; prune failures.
2. `settings.ts` getters, `GET/PUT /api/settings/markets`.
3. `/api/markets`: per-symbol cache, `resolveSections`, `short` and
   `description` on `MarketData`, `sections` and `hidden` in the response.
   Page should look identical to today at this point except for the
   sub-lines and `AUD/USD` replacing `CAD/USD`.
4. `market-table.tsx`: heading button, sub-line, empty state, flip button.
5. `market-sections-modal.tsx`, wired into `market-overview.tsx`.
6. Flip from the table row.
7. Verify in the browser: pick 8 in a section and confirm the 9th is
   disabled; uncheck everything and confirm the empty state; flip USD/CAD
   both ways and confirm price, change and range invert (0.724 ⇄ 1.381);
   set an alert on a row, remove the row, confirm the rule still lists and
   still triggers; check dark mode and the `lg` breakpoint where the grid
   collapses to one column.
8. Bump version in `package.json`.

## Things not to do

- Do not compute an inverted price, change or range client-side. Fetch the
  other orientation.
- Do not put the description in the table sub-line. `short` only.
- Do not style the heading `text-primary` at rest.
- Do not delete alert rules on removal or flip.
- Do not touch the digest, the glance tile, or `exchange-rate/route.ts`,
  which reads `USDCAD=X` directly and is unrelated to this list.
