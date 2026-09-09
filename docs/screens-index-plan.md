# Screens index: a landing page for saved screens

Implementation plan. Decisions below were made in discussion and are settled;
do not re-open them. Follow the design-token rules in `CLAUDE.md`. Do not
commit unless asked.

## Goal

Today the Screens tab drops the user into whichever screen was created first
(`src/app/page.tsx` auto-selects `data[0]`). A screen is a saved query you
*run*, not a view you monitor, so the collection is the interesting object.
This plan makes the Screens tab itself an **index** of saved screens, keeps the
header dropdown as a quick switcher, and persists just enough about the last
run for the index to be worth reading at a glance.

Two passes. **Pass 1 is this document.** Pass 2 (a `screen_runs` table,
"new since last run", digest/alert hooks, "Run all") is sketched at the end
and is out of scope now.

## Settled decisions

- **Screens tab click always shows the index**, even while a screen is open.
  Selecting from the dropdown or the index opens a screen. No auto-select.
- **Index is a table, not cards**, in a `Panel`, mirroring
  `PortfolioSummaryList`. One row per screen: name + plain-English rule
  summary, source, match mode, last run, actions.
- **Persist three columns on `screens`**: `last_run_at`, `last_match_count`,
  `last_total_scanned`. The run endpoint writes them whenever it runs a saved
  screen (not an inline run). No results are stored in pass 1.
- **Nothing runs automatically on landing.** The index shows stored numbers.
  "Run" on a row opens that screen and starts a run immediately. There is no
  in-place run on the index in pass 1, because results are not persisted yet
  and a count you cannot inspect is not useful.
- **Actions per row**: Open (row click), Run, Duplicate, Rename (inline),
  Delete (`confirm()`, matching the header). Duplicate stays on the index.
- **Empty state** (no screens) shows the existing name-and-create form plus
  the built-in and custom presets as one-click starting points. When screens
  exist, presets stay in the editor only; the index header gets a "New screen"
  form.
- **Screens list state is lifted to `page.tsx`** and passed to `AppHeader`,
  so index mutations and dropdown mutations see the same list. The header
  keeps its own fetch only when no list is passed (the `/portfolio/[id]`
  subpage).
- **Deep link**: `/?tab=screens&screen=<id>` opens that screen on load, read
  and then stripped from the URL exactly as `?tab=` is today. No other URL
  state; the app does not route by URL and this plan does not change that.
- **Screen detail header** loses the decorative icon tile and the inline
  `<svg>` (both against `CLAUDE.md`). It becomes a `PanelHeader` with a back
  affordance to the index and a meta line built from the persisted run data.
- **Rule summary is a pure formatter** with unit tests, shared by the index
  row and the detail header.

## Out of scope (pass 1)

- Storing matched symbols, "new since last run", "Run all", digest or alert
  integration (pass 2).
- A "Continue where you left off" row. Not needed once the index exists.
- Refactoring `NavDropdown`'s inline-rename into a shared component. The
  index may duplicate those ~20 lines; leave `nav-dropdown.tsx` alone.
- Backup: screens and screen presets are **not** in `/api/export` or
  `/api/import` today. That is a pre-existing gap. Do not fix it here, but
  note it in the final report so it can be its own task.
- Restyling the editor or results table beyond the two icon replacements
  named below.

## 1. Data model

`src/lib/db/schema.ts`, table `screens`, add after `updatedAt`:

```ts
lastRunAt: integer("last_run_at", { mode: "timestamp" }),
lastMatchCount: integer("last_match_count"),
lastTotalScanned: integer("last_total_scanned"),
```

All nullable; existing rows read as "never run". Run `npx drizzle-kit push`
before restarting the dev server (see the warning in `CLAUDE.md`).

## 2. API

### `GET /api/screens`, `POST`, `PATCH` (`src/app/api/screens/route.ts`)

`formatScreen()` adds:

```ts
lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
lastMatchCount: row.lastMatchCount ?? null,
lastTotalScanned: row.lastTotalScanned ?? null,
```

`PATCH` does **not** accept these fields; only the run endpoint writes them.
`updateScreenSchema` stays as is.

### `POST /api/screens/run` (`src/app/api/screens/run/route.ts`)

In the `"screenId" in parsed` branch, after results are computed and before
responding, write back:

```ts
await db.update(schema.screens)
  .set({ lastRunAt: new Date(), lastMatchCount: results.length, lastTotalScanned: symbols.length })
  .where(eq(schema.screens.id, parsed.screenId));
```

Also do this on the two early returns (`rules.length === 0`, no symbols)
when running a saved screen, with counts `0`, so a screen that was run and
matched nothing does not look like it was never run. Do **not** touch
`updatedAt`; that means "rules changed", and the autosave indicator and the
index both rely on that distinction.

Response gains `lastRunAt: string | null` (the value just written, or `null`
for inline runs) so the client can update its copy without refetching.

### `src/lib/screener/api.ts`

- `ScreenDTO` gains `lastRunAt: string | null`, `lastMatchCount: number | null`,
  `lastTotalScanned: number | null`.
- `RunScreenResponse` gains `lastRunAt: string | null`.
- Add `duplicateScreen(screen: ScreenDTO)`: calls `createScreen` with
  `name: nextCopyName(screen.name, existingNames)`, and the same `source`,
  `rules`, `match`. `nextCopyName` lives in `describe.ts` (below) so it can
  be tested: "Foo" → "Foo copy" → "Foo copy 2" → "Foo copy 3".

## 3. Pure helpers: `src/lib/screener/describe.ts` (new)

All pure, no React, no fetch. Tests in
`src/lib/screener/__tests__/describe.test.ts` (Vitest, same style as
`src/lib/digest/__tests__/select.test.ts`).

```ts
/** "Below 52-Week High ≥ 20%", "Trailing P/E between 0x and 15x", "Beta ≤ 1" */
export function describeRule(rule: ScreenRule): string

/** Rules joined with " and " (match all) or " or " (match any). Empty → "No rules yet". */
export function describeScreen(rules: ScreenRule[], match: "all" | "any"): string

/** "All symbols" | "Watchlist: Canadian Banks" | "Portfolio: TFSA" | "Watchlist (deleted)" */
export function describeSource(
  source: string,
  watchlists: { id: number; name: string }[],
  portfolios: { id: number; name: string }[]
): string

/** "Never run" | "Just now" | "12 min ago" | "3 h ago" | "Yesterday" | "Sep 2" | "Sep 2, 2025" */
export function formatLastRun(iso: string | null, now?: Date): string

/** "Foo" → "Foo copy" → "Foo copy 2", skipping names already taken. */
export function nextCopyName(name: string, existing: string[]): string
```

Formatting rules for `describeRule`:

- Operator glyphs: `gte` → `≥`, `lte` → `≤`, `gt` → `>`, `lt` → `<`,
  `between` → `between A and B`.
- Thresholds use a new `formatThreshold(value, key)` (same file) rather than
  `formatMetricValue`: no forced two decimals, no forced `+` sign. `20` →
  `20%`, `-5` → `-5%`, `2.5` → `2.5`, `15` with unit `x` → `15x`, `10` with
  unit `$B` → `$10B`, `0.5` with `$B` → `$500M`.
- Unknown metric key: fall back to the raw key so a bad row is visible, not
  hidden.

`formatLastRun` takes `now` as a parameter for testability; the component
passes nothing.

## 4. State and navigation (`src/app/page.tsx`)

- `selectedScreenId === null` **means the index**. Remove the
  `if (!selectedScreenId && data.length > 0) setSelectedScreenId(data[0].id)`
  branch in the screens `useEffect`.
- Fetch the screens list once on mount (not only when the tab is active), so
  the header dropdown is populated by the page, and refetch when the tab
  becomes `screens` so counts are fresh after a run elsewhere.
- Read `?screen=<id>` alongside `?tab=` in the mount effect. Parse with
  `parseInt`, ignore `NaN`. It is stripped by the existing `replaceState`.
- `getInitialScreenId()` (sessionStorage) keeps working for header selection
  from the subpage.
- Pass to `AppHeader`: `screens={screens}` and
  `onScreensChange={setScreens}`. Change `onSelectScreen` to accept
  `number | null`.
- Render:

```tsx
{activeTab === "screens" && (
  currentScreen ? (
    <ScreenContent
      screen={currentScreen}
      runOnOpen={runOnOpenId === currentScreen.id}
      onRunConsumed={() => setRunOnOpenId(null)}
      onBack={() => setSelectedScreenId(null)}
      onScreenUpdated={...existing...}
      onScreenRan={(id, run) => setScreens(prev => prev.map(s => s.id === id ? { ...s, ...run } : s))}
    />
  ) : (
    <ScreenIndex
      screens={screens}
      onOpen={(id) => setSelectedScreenId(id)}
      onRun={(id) => { setRunOnOpenId(id); setSelectedScreenId(id); }}
      onScreensChange={setScreens}
    />
  )
)}
```

- `runOnOpenId: number | null` is new page state. `ScreenContent` calls
  `handleRun()` once after its prop sync effect when `runOnOpen` is true,
  then calls `onRunConsumed()`.
- `onScreenRan` is how a run's persisted numbers reach the list without a
  refetch. `ScreenContent.handleRun` calls it with
  `{ lastRunAt, lastMatchCount: response.matchCount, lastTotalScanned: response.totalScanned }`
  when running a saved screen.

## 5. Header (`src/components/layout/app-header.tsx`)

- New optional props: `screens?: ScreenDTO[]`,
  `onScreensChange?: (next: ScreenDTO[]) => void`. Type the screens list as
  `ScreenDTO` (from `@/lib/screener/api`), not the schema `Screen`;
  `NavDropdown` only needs `id` and `name`.
- Internal `screens` state becomes a fallback: if the prop is provided, use
  it and skip the initial screens fetch and the "refetch when the selection
  points at an unknown id" effect. `handleCreateScreen`,
  `handleRenameScreen`, `handleDeleteScreen` update via `onScreensChange`
  when present, else local state as today.
- `onSelectScreen: (id: number | null) => void`.
- `handleTabClick("screens")` on the dashboard: call `onSelectScreen(null)`
  before `onTabChange("screens")`. On the subpage it already navigates to
  `/?tab=screens` with no stored id, which lands on the index; leave it.
- `handleDeleteScreen`: when the deleted screen is the open one, call
  `onSelectScreen(null)` (go to the index) instead of selecting the next
  remaining screen.
- The subpage (`src/app/portfolio/[id]/page.tsx`) passes nothing new; its
  `onSelectScreen={() => {}}` keeps compiling with the widened type.

## 6. Index component: `src/components/screener/screen-index.tsx` (new)

Props:

```ts
interface ScreenIndexProps {
  screens: ScreenDTO[];
  onOpen: (id: number) => void;
  onRun: (id: number) => void;
  onScreensChange: (next: ScreenDTO[]) => void;
}
```

Fetches `/api/watchlists` and `/api/portfolios` once (same two calls the
editor makes) purely to label sources. Fetches `/api/screen-presets` only for
the empty state.

**Loaded, non-empty**: `Panel` → `PanelHeader title="Screens" meta={`${n} screen(s)`}`
with a `right` slot holding the New screen form (`Input` placeholder
"New screen name" + `Button size="sm"` "Add", the same shape as the dropdown's
create row). On create: `createScreen({ name })`, append to the list, then
`onOpen(created.id)`. A brand-new screen has no rules, so opening it is the
right next step.

Table (`overflow-x-auto`, same cell classes as `PortfolioSummaryList`):

| Column   | Content |
|----------|---------|
| Screen   | Name (`text-sm font-medium`), rule summary beneath (`text-xs text-subtle-foreground`, `truncate`, full text in `title`). Row click → `onOpen`. |
| Source   | `describeSource(...)` as a neutral badge (`rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground`). |
| Match    | "All" or "Any", same neutral badge. |
| Last run | `formatLastRun(lastRunAt)` on one line; beneath, `"{lastMatchCount} of {lastTotalScanned} matched"` in `font-mono text-xs`, or nothing if never run. Never colour these; a match count is not a direction. |
| Actions  | Right-aligned icon buttons, visible on row hover like the dropdown (`opacity-0 group-hover:opacity-100`), each `stopPropagation()`: Run (`Play`), Duplicate (`Copy`), Rename (`Pencil`), Delete (`Trash2`). All `lucide-react`, `size-3.5`, with `aria-label`s that include the screen name. |

Rename toggles the name cell into an `Input` + Save (Escape cancels), copying
the pattern in `nav-dropdown.tsx`; on submit `updateScreen(id, { name })`
and `onScreensChange`. Delete: `confirm("Are you sure you want to delete this screen?")`
then `deleteScreen(id)` and `onScreensChange`. Duplicate: `duplicateScreen`
then append.

Ordering: as returned by the API (`createdAt` ascending), matching the
dropdown. Do not add sorting in pass 1.

**Loading**: three `h-14 animate-pulse rounded-md bg-muted` rows inside the
panel, like the portfolio list. The list is loaded by the page, so pass a
`loading` boolean or treat "fetch not yet resolved" as loading; either is
fine, but an empty array before the first fetch must not flash the empty
state. Suggested: page keeps `screensLoaded: boolean` and passes it.

**Empty**: move `CreateScreenPrompt` out of `screen-content.tsx` into
`screen-index.tsx` (it is only used from there now). Below its form add
"Or start from a preset" with a chip row: `SCREEN_PRESETS` and then any
custom presets from `fetchPresets()`. Clicking a chip calls
`createScreen({ name: preset.name, rules: preset.rules, match: preset.match })`
and then `onOpen(created.id)`. Chips reuse the editor's preset chip styling
(neutral, `bg-muted`), no accent.

## 7. Detail changes (`src/components/screener/screen-content.tsx`)

- New props: `runOnOpen?: boolean`, `onRunConsumed?: () => void`,
  `onBack: () => void`,
  `onScreenRan?: (id: number, run: Pick<ScreenDTO, "lastRunAt" | "lastMatchCount" | "lastTotalScanned">) => void`.
- Remove the `if (!screen) return <CreateScreenPrompt/>` branch and the
  `CreateScreenPrompt` function; `screen` becomes required. The page never
  renders `ScreenContent` without a screen now.
- Replace the header block (the `w-8 h-8 rounded-lg bg-muted` tile with the
  inline `<svg>`, and the "N rules configured" line) with:

```tsx
<PanelHeader
  title={
    <span className="flex items-center gap-2">
      <button type="button" onClick={onBack} aria-label="Back to screens"
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />
        Screens
      </button>
      <span className="text-subtle-foreground">/</span>
      {screen.name}
    </span>
  }
  meta={`${rules.length} rule${rules.length === 1 ? "" : "s"}`}
  right={lastRunLabel}
/>
```

  where `lastRunLabel` is `formatLastRun(screen.lastRunAt)` plus
  `" · N of M matched"` when a run exists. Wrap the whole card in `Panel`
  instead of the hand-rolled `rounded-lg bg-card border` div.
- `handleRun`: after a successful saved-screen run, call
  `onScreenRan(screen.id, { lastRunAt: response.lastRunAt, lastMatchCount: response.matchCount, lastTotalScanned: response.totalScanned })`.
- `runOnOpen`: in the prop-sync effect keyed on `screen?.id`, after resetting
  results, `if (runOnOpen) { handleRun(); onRunConsumed?.(); }`. Guard
  against firing twice under StrictMode with a ref keyed on the screen id.
- `src/components/screener/screen-results.tsx`: replace the two inline
  `<svg>` blocks with `lucide-react` icons (`Filter` for "configure rules",
  `SearchX` for "no matches"), `size-10 text-subtle-foreground`. Drop the
  `opacity-40`; `subtle-foreground` is already the quiet token.

## 8. Order of work

1. Schema columns + `npx drizzle-kit push`.
2. `describe.ts` + tests. `npm test` green before touching UI.
3. `api.ts` types, `duplicateScreen`; `screens/route.ts` `formatScreen`;
   `run/route.ts` write-back and `lastRunAt` in the response.
4. Header: optional lifted props, widened `onSelectScreen`, tab click and
   delete behaviour.
5. `page.tsx`: state model, `?screen=` deep link, render branch, `runOnOpenId`.
6. `screen-index.tsx` including the moved `CreateScreenPrompt` and presets.
7. `screen-content.tsx` header, back, `runOnOpen`, `onScreenRan`;
   `screen-results.tsx` icons.
8. `npm run lint`, `npm test`, `npm run build`.

## 9. Verification (browser)

Use the app's dev server through the Browser pane, not Bash.

- Fresh load with no `?tab`, then click Screens: the index appears, no screen
  auto-opens.
- Click a row: detail opens with the back affordance; click "Screens" in the
  header tab: back to the index. Click the back affordance: same.
- Rename and delete from the index: the header dropdown reflects both without
  a reload. Rename and delete from the dropdown: the index reflects both.
- Delete the open screen from the dropdown: lands on the index.
- Run from the detail: on return, the row shows "Just now" and "N of M matched".
- Run from a row: the detail opens and results populate without a second
  click; the row shows updated counts on return.
- Duplicate: a new row named "X copy" appears with the same summary; the
  original is untouched. Duplicate again: "X copy 2".
- Delete every screen: the empty state with presets appears; click a preset:
  a screen with those rules opens.
- `/?tab=screens&screen=<id>`: opens that screen; the URL is cleaned.
- `/portfolio/<id>` → Screens tab: index. Dropdown item from there: that screen.
- Dark mode: badges and the last-run line stay on tokens, no `dark:` pairs.

## 10. Pass 2 sketch (not now)

- `screen_runs` table: `id, screenId, ranAt, totalScanned, matchCount,
  symbols (JSON)`. Keep the last N per screen.
- Index and results show "N new since last run" by diffing the latest two
  runs; new symbols get a neutral "new" badge in the results table.
- "Run all" on the index, running sequentially and updating rows as each
  finishes.
- Digest hook: a "Screens" section listing screens with new matches.
- Backup: include `screens`, `screen_presets`, and `screen_runs` in
  export/import.
