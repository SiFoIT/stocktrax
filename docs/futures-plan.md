# Index futures on the Markets page

Implementation plan. Decisions below were made in discussion and are settled;
do not re-open them. Follow the design-token rules in `CLAUDE.md` throughout.
Do not commit.

## Goal

Cash indices (`^GSPC`, `^IXIC`, `^DJI`) never trade outside 9:30–4:00 ET, so
the four headline cards are frozen from Friday's close to Monday's open and
Yahoo never returns pre/post prices for them. The `ExtendedHoursLabel` slot on
the card exists but never renders for an index.

This change fills that slot with the corresponding **E-mini futures change**
whenever the US cash market is not in its regular session, and mirrors the
S&P futures change on the **Market status** glance tile.

Explicitly **out of scope**: a futures row set in the tables, futures alerts,
futures charts, fair-value / "implied open" math, TSX futures.

## Settled decisions

- **Second line on the card, not a separate block.** The cash index stays the
  anchor. Futures render as one extra line in the existing extended-hours slot.
- **Percent only, no futures price level.** ES trades at a basis to the cash
  index; showing 7,740 under a 7,711 close reads as an error. Show the futures
  `changePercent`, coloured with `getChangeColor()`.
- **Label is "Futures", not "Implied open".** The number is the contract's
  change vs its own prior settlement (what CNBC shows). The Nasdaq card says
  **"NDX futures"** because `NQ=F` tracks the Nasdaq 100, not the Composite.
- **Shown right up to the open.** The line is visible whenever the cash index's
  `marketState !== "REGULAR"`. Yahoo publishes no indicative pre-market value
  for indices, so there is nothing to switch to before 9:30.
- **Hidden during regular hours.** The cash card is live then and the two
  numbers would disagree by the basis.
- **Gate on Yahoo's `marketState` for the cash index**, which the route already
  returns in `extendedHours.marketState`. This is the same signal
  `ExtendedHoursLabel` uses and it handles holidays for free. The 5-minute
  category cache means the line may linger up to 5 min past 9:30; accepted.
- **No special-casing of the CME break or weekends.** Sat/Sun before 6pm the
  futures change is Friday's session vs Thursday's settle, which is stale in
  exactly the same way the cash card is stale. Sunday 6pm ET it goes live.
  Expose the quote time as a `title` tooltip so the staleness is inspectable.
- **S&P/TSX Composite gets no futures line.** The SXF contract is not reliably
  on Yahoo. The card renders exactly as today.
- **Failure is silent.** A missing or failed futures quote hides the line; it
  never blanks or breaks the card.

## Contracts

| Card | Symbol | Futures | Label |
|---|---|---|---|
| S&P 500 | `^GSPC` | `ES=F` | Futures |
| S&P/TSX Composite | `^GSPTSE` | — | — |
| Nasdaq | `^IXIC` | `NQ=F` | NDX futures |
| Dow Jones | `^DJI` | `YM=F` | Futures |

Yahoo's `=F` symbols are continuous front-month. Around quarterly rolls the
change can jump for a day. Accepted, not handled. Futures quotes carry a
10-minute delay, comparable to what the app already shows.

## Files

| File | Change |
|---|---|
| `src/lib/markets/symbols.ts` | Add optional `futures?: { symbol; label }` to `MarketSymbol`; set it on the three US entries |
| `src/types/index.ts` | Add `FuturesQuote`; add `futures?: FuturesQuote` to `MarketData` |
| `src/app/api/markets/route.ts` | Fetch the futures quote alongside the index quote in `fetchCategoryData`; attach it |
| `src/components/markets/market-format.ts` | Add `showFutures(data)` gate (pure, one line of logic) |
| `src/components/markets/market-card.tsx` | Render the futures line in the extended-hours slot |
| `src/components/markets/market-glance.tsx` | Accept `futures?: FuturesQuote \| null`; append it to the Market tile's sub line |
| `src/components/markets/market-overview.tsx` | Derive the `^GSPC` futures quote from `marketData` and pass it to `MarketGlance` |

No schema change. No new API route. No new component.

## Data flow

`MARKET_SYMBOLS` is consumed only by `src/app/api/markets/route.ts`, so
adding an optional field is safe.

In `fetchCategoryData`, for an entry with `futures`, add a third promise to the
existing `Promise.all`:

```ts
const [quote, timeSeries, futuresQuote] = await Promise.all([
  getQuote(symbol),
  getTimeSeries(symbol, "5d", "5m"),
  futures ? getQuote(futures.symbol, true) : Promise.resolve(null),
]);
```

`getQuote(sym, true)` returns `QuoteWithRange`, which carries `lastTradeTime`
(needed for the tooltip) and `extendedHours.marketState`. Map it to:

```ts
export interface FuturesQuote {
  symbol: string;         // "ES=F"
  label: string;          // "Futures" | "NDX futures"
  price: number;
  change: number;
  changePercent: number;
  marketState?: MarketState;
  lastTradeTime?: string; // ISO
}
```

`price` and `change` are kept in the payload for the tooltip and for any later
details view; they are **not rendered** on the card.

The futures quote rides inside the existing `markets_markets` cache blob, so
it inherits `CACHE_TTL.markets` (5 min) and the `?refresh=true` path with no
extra cache entry. A cached blob written before this change simply lacks the
field and the line stays hidden until the TTL expires.

Do not add the futures symbols to `flatSymbols` in `market-overview.tsx`. They
are not chartable from this page and must not appear in the alert or chart
symbol lists.

## Rendering

### Gate (`market-format.ts`)

```ts
/** Futures only add information while the cash index is not trading. */
export function showFutures(data: MarketData): boolean {
  return !!data.futures && data.extendedHours?.marketState !== "REGULAR";
}
```

If `extendedHours` is absent entirely (quote failed), the gate is `true` when
`futures` exists. That is correct: an index with no quote is not in session.

### Card (`market-card.tsx`)

Replace the current `{data.extendedHours && (...)}` block with:

```tsx
{showFutures(data) && data.futures && (
  <div
    className="mt-1.5 flex items-center gap-1.5 text-xs"
    title={futuresTooltip(data.futures)}
  >
    <span className="text-muted-foreground">{data.futures.label}</span>
    <span className={`font-mono ${getChangeColor(data.futures.changePercent)}`}>
      {formatPercent(data.futures.changePercent)}
    </span>
  </div>
)}
```

- `text-xs`, matching the card's own percent line, not the 10px compact label.
- Label is neutral `text-muted-foreground`. Not `text-warning`: a futures
  quote is not an alert (see "Colour must mean something" in `CLAUDE.md`).
- `getChangeColor` / `formatPercent` from `@/lib/utils`.
- `futuresTooltip` lives in `market-format.ts`, e.g.
  `"ES=F 7,741.25 (+24.50) · 6:42 PM ET"`. Format the time with the existing
  Eastern-time helpers; do not hand-roll a timezone offset.
- The `ExtendedHoursLabel` import becomes unused in `market-card.tsx`; remove
  it. Leave `market-table.tsx` alone (its rows are not indices with futures and
  the label remains correct for anything that does report pre/post prices).

The card must not change height when the line appears or disappears at 9:30.
Check with and without the line; if it shifts, reserve the line's height with
a placeholder (` `) the same way `market-glance.tsx` does.

### Glance tile (`market-glance.tsx`)

Add a prop:

```ts
/** S&P 500 futures, shown while the cash market is closed. */
futures?: FuturesQuote | null;
```

The Market tile's `sub` becomes a node that appends the futures change when
the tile says Closed **and** a quote is present:

```
Opens Mon 9:30 AM ET · Futures +0.32%
```

- Separator is ` · ` to match the mover tiles.
- Only the percent is coloured; "Futures" and the transition text stay muted.
- Gate on the tile's own `market.open === false`, not on Yahoo's state. The
  tile is driven by the client calendar and the two must agree on the same
  tile. (The card uses Yahoo's state because that is what the card already
  has; the two gates differ by at most the 5-minute cache lag.)
- Wrap in `block truncate` so a narrow 2-column layout clips rather than wraps
  and changes the tile height.

### Wiring (`market-overview.tsx`)

```ts
const sp500Futures = useMemo(
  () => marketData?.markets.find((d) => d.symbol === "^GSPC")?.futures ?? null,
  [marketData]
);
```

Pass as `futures={sp500Futures}` to `MarketGlance`. Import `HEADLINE_SYMBOLS[0]`
rather than repeating the literal if that reads better; either is fine.

## Order of work

1. `symbols.ts` and `types/index.ts` (pure types + config).
2. `route.ts` fetch and mapping. Verify with
   `curl -s localhost:3000/api/markets?refresh=true | jq '.markets[] | select(.futures) | {symbol, futures}'`.
3. `market-format.ts` gate + tooltip.
4. `market-card.tsx` line.
5. `market-glance.tsx` prop + sub line, then `market-overview.tsx` wiring.
6. `npm run lint` and `npm run build`.

## Verify

There is no test runner in this repo. Check by hand:

- Outside RTH: all three US cards show the line; the TSX card does not. The
  Market tile sub ends with `· Futures ±x.xx%`.
- During RTH: no futures line on any card; tile sub is `Closes 4:00 PM ET`
  with no suffix. To exercise this path outside RTH, temporarily hard-code
  `marketState: "REGULAR"` in the route and confirm the line disappears, then
  revert.
- Kill the network or point `ES=F` at a bogus symbol: card renders exactly as
  today, no console errors.
- Toggle light/dark: the muted label and the positive/negative percent both
  read clearly on `bg-card`.
- iPad width (2-column glance row): tile sub truncates, tile height unchanged.
- Card height is identical with and without the line.

## Open items deferred, not decided

- Russell 2000 (`RTY=F`) and VIX (`VX=F`) futures have no headline card to
  attach to. If wanted later, that is the case for a small futures block in
  the table, not this change.
- Showing the futures line inside the index details modal.
