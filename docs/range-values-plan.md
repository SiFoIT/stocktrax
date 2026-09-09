# Range bars: values above the track, and the price on the mover tiles

Implementation plan. Decisions below were made in discussion and are settled;
do not re-open them. Follow the design-token rules in `CLAUDE.md`. Do not
commit unless asked.

## Goal

Every price range bar in the app shows the same three lines: the low and high
**above** the track at its two ends, the track with the position marker, and
the two distances (percent above the low, percent off the high) **below**. The
reader learns the anatomy once and it holds on the markets table, the four
index cards, the watchlist and the stock details modal.

Separately, the "Watchlist gainer" and "Watchlist loser" tiles at the top of
the Markets page show the price before the percent, on one line, in the same
format the index cards already use.

## Current state

There are two range bar implementations and they disagree.

- `src/components/ui/price-range-bar.tsx` is the shared one, with three
  variants selected by boolean props:
  - `mini` (markets table, index cards): track, then the two distances below.
    Low and high are only in a `title` tooltip.
  - `compact` (watchlist): track, low and high below, and with
    `showDistance` a second line of distances squeezed under that with a
    negative margin.
  - default (unused since the modal has its own copy): track, low and high
    below.
- `src/components/stocks/stock-details-modal.tsx:189` has a private
  `PriceRangeBar` with a label line above, the track, and the low and high
  below. It colours the low `text-negative` and the high `text-positive`,
  which breaks the "colour is for direction" rule, and it prints a bare `$`
  while the header prints `US$` via `formatCurrency`.

The mover tiles in `src/components/markets/market-glance.tsx:111` render only
`formatPercent(item.changePercent)` on the value line.

## Settled decisions

- **One layout, three sizes.** Values above, track, distances below. No
  variant omits the values line. The `showDistance` prop goes away; the
  distances are always shown.
- **Values are neutral.** Low and high use `text-subtle-foreground` in every
  size. Distances stay `text-positive` / `text-negative` as today, because
  they are directional.
- **The modal uses the shared component.** Delete the private copy and add a
  `label` prop to the shared one. The label renders on its own line above the
  values line, `text-xs text-muted-foreground`, exactly where it is today.
- **Formatting comes from the caller.** The shared component keeps its
  `format` prop. The markets table and cards pass `formatMarketPrice`; the
  modal passes `(v) => formatCurrency(v, details.currency)` so the range reads
  `US$13.38`, matching the header; the watchlist keeps the default two-place
  dollar figure.
- **Markets table column widens** from `w-20` (80px) to `w-28` (112px) so two
  figures like `4,441.70` fit side by side at the mono size. Row height must
  not change; the two-line name cell already leaves room for three short
  lines.
- **The range bar text stays at 10.5px.** Raising it to 11.5px was tried and
  reverted: it does not fit. At that size the widest pairs in the markets
  table sit 1.6px apart and read as one joined number, and the column has to
  grow to 128px to separate them, which throws the table out of balance.
- **Mover tiles show the price then `changePercent`** on the value line,
  separated by a space — the actual value, not the change amount. The price
  uses `formatCurrency(item.price, item.currency)`, the same call the
  watchlist price column makes, so it carries `US$` / `C$`.
- **The price is neutral, the percent is coloured.** Colour is for direction,
  and a price has none, so the tile no longer tints its whole value line:
  the price is `text-foreground` and only the percent takes
  `getChangeColor()`. This matches the index cards, where the price is
  neutral and the change beside it is coloured.
- **Raise the two grey text tokens to AAA.** `--subtle-foreground` shipped at
  4.53:1 on the light background, which is AA by a hair and hard to read at
  the 10.5px range-bar size. Both greys move up two steps in both themes,
  clearing 7:1, and `subtle` stays just below `muted` so the hierarchy
  survives. The ceiling is the gap to `--foreground`: at these values the
  greys still sit about 2:1 away from primary text, which is what keeps them
  reading as secondary.
- **Do not** put the current price above the marker dot. The price is the
  headline number in every context that has a bar.

## Layout spec

Three sizes, selected by a `size` prop replacing the `mini` / `compact`
booleans. Names are `"xs"`, `"sm"`, `"md"`.

| size | where | track | marker | values line | distances line |
|---|---|---|---|---|---|
| `xs` | markets table, index cards | `h-1` | `size-1.5` | `text-[10.5px]` mono | `text-[10.5px]` mono |
| `sm` | watchlist, performance table | `h-1.5` | `size-2` | `text-[10.5px]` | `text-[10px]` |
| `md` | modal | `h-1.5` | `size-2.5` | `text-xs` | `text-xs` |

Vertical rhythm for all sizes: values line, `mb-1`, track, `mt-1`,
distances line. Drop the `-mt-0.5` squeeze that `compact` uses today.

Width: `xs` and `md` fill their container (the table cell wraps in
`mx-auto w-28`; the card and modal give it full width). `sm` keeps its own
`w-32 mx-auto` as today.

The `title` tooltip on `xs` is no longer needed once the values are visible;
remove it.

## Steps

Each step leaves the app working and is visible on the Markets page or the
watchlist, so screenshot after each one.

### 1. Shared component

`src/components/ui/price-range-bar.tsx`

- Replace `mini`, `compact`, `showDistance` with `size?: "xs" | "sm" | "md"`
  (default `"md"`) and `label?: string`.
- Render: optional label line, values line (low left, high right,
  `flex justify-between text-subtle-foreground`), track with marker,
  distances line (`+aboveLow` left in positive, `offHigh` right in negative).
- Keep the existing `position`, `aboveLow`, `offHigh` and `offHighLabel`
  maths unchanged.
- Keep `format` with the same default.

Update the four call sites in the same step so the build stays green:

- `src/components/markets/market-table.tsx:98` — `size="xs"`, and change the
  wrapper from `mx-auto w-20` to `mx-auto w-28`.
- `src/components/markets/market-card.tsx:86` — `size="xs"`.
- `src/components/watchlist/watchlist-table.tsx:253` and `:260` —
  `size="sm"`, drop `compact` and `showDistance`.
- `src/components/portfolio/portfolio-performance-table.tsx:231` and `:238` —
  same. Do not rewrite `compact` blindly across these files: the watchlist
  also passes `compact` to `ExtendedHoursLabel`, which is unrelated.

### 2. Modal

`src/components/stocks/stock-details-modal.tsx`

- Delete the private `PriceRangeBar` at line 189.
- Import the shared one and at lines 456 and 463 pass `size="md"`, the
  existing `label`, and `format={(v) => formatCurrency(v, details.currency)}`.
- The `Day High` / `Day Low` and `52-Week High` / `52-Week Low` rows in the
  Trading and 52-Week Performance sections keep their colours; they are
  unrelated to this change.

### 3. Mover tiles

`src/components/markets/market-glance.tsx`

- Leave the `movable` filter alone. The mover is chosen by `changePercent`,
  and a missing price must not change which symbol wins, so guard the price
  at render time instead.
- In `moverTile`, inside the existing flex span next to the `StockIcon`,
  render the price in `text-foreground` (when `item.price` is defined) and
  then the percent in `getChangeColor(item.changePercent)`.
- Set `valueClass` to `undefined` for a populated tile so the line no longer
  tints as a whole; keep `text-muted-foreground` for the empty placeholder.
- Add `whitespace-nowrap` to the flex span, and confirm the value line stays
  a single 28px line at the tile's narrowest width (four tiles across at
  1280px).

### 4. Grey tokens

`src/app/globals.css`, both themes. Light `--muted-foreground` `#616872` →
`#474d55` and `--subtle-foreground` `#6b727c` → `#4c525b`; dark
`--muted-foreground` `#8b919a` → `#a8afb9` and `--subtle-foreground`
`#7b828e` → `#a1a8b2`. Mirror the new values into the token table in
`docs/ui-restyle-plan.md` §1, whose `--subtle-foreground` row was already
stale.

Next dev serves stale CSS if a `next build` has run against the same `.next`
directory since the server started. If a token edit does not show up, stop the
dev server, `rm -rf .next`, and start it again.

### 5. Verify

- `npm run lint` and `npm test` pass.
- Markets page, `5D` range: the table column shows low, high and both
  distances on every row, including the currency rows (three decimals) and
  the indices above 10,000 (no decimals). Rows are the same height as before.
- Index cards show the values line above the track.
- Watchlist: Day Range and 52W Range columns both show all three lines, no
  overlap between the values and distances lines.
- Modal for an index (^VIX) and a stock (AMD): 52-Week Range and Day Range
  read `US$x.xx` at both ends with neutral colour, distances below.
- Mover tiles read like `US$761.67` in the normal text colour followed by
  `-0.56%` in red, with the tile height unchanged.
- Light theme: `text-subtle-foreground` measures 7.35:1 on `bg-background`
  and 7.88:1 on `bg-card`, up from 4.53 and 4.86. Dark measures 8.06:1, up
  from 4.99. `text-muted-foreground` lands at 7.96 light and 8.74 dark.

## Follow-up: the modal follows the page's selected range

Shipped after the work above, for the same reason: a card read one window and
the modal read another, with nothing on screen saying so.

- **The caller passes the window in; the modal does not refetch it.** The
  markets page already holds the selected range and each symbol's range change,
  low and high, because the cards and rows render them. `StockDetailsModal`
  takes an optional `range` prop carrying those, so the modal repeats exactly
  what was clicked. Refetching would reintroduce the mismatch.
- **Every other caller omits it.** The modal also opens from the watchlist
  dividend table and four portfolio tables, none of which have a range
  selector. Without the prop the header falls back to the day, labelled
  "Today", and the second bar stays "Day Range" — the previous behaviour.
- **Both are labelled.** The header change carries its window name next to the
  percent. This matters because the Trading section below is always today's
  session, so an unlabelled 5D header beside a Day High row is what read as a
  contradiction.
- **The second bar follows the window and renames with it** ("5D Range"). The
  52-week bar never moves; it is the fixed anchor for where a price sits in its
  own history.
- **Known consequence:** the markets range is remembered in localStorage, so a
  reader who once chose 5Y will see a 5Y change as the modal headline. The
  label is what makes that honest rather than wrong.

## Out of scope

- Any change to how the range low and high are computed (`src/lib/markets/ranges.ts`).
- Sorting the watchlist by range position (already exists, untouched).
