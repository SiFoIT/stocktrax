# StockTrax

A stock portfolio and watchlist tracking application built with Next.js.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Database**: SQLite via better-sqlite3 + Drizzle ORM
- **Styling**: Tailwind CSS 4
- **UI Components**: Radix UI primitives with shadcn/ui patterns
- **Charts**: lightweight-charts (TradingView) for price charts, Recharts for allocation
- **Stock Data**: yahoo-finance2 (15-20 min delayed quotes, cached 1hr for daily / 5min for intraday)
- **Validation**: Zod

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── holdings/route.ts      # Portfolio holdings CRUD
│   │   ├── portfolios/route.ts    # Portfolios CRUD
│   │   ├── search/route.ts        # Symbol autocomplete
│   │   ├── stocks/[symbol]/route.ts # Quote + time series data
│   │   ├── watchlist/route.ts     # Watchlist items CRUD
│   │   └── watchlists/route.ts    # Watchlists CRUD
│   ├── portfolio/[id]/page.tsx    # Portfolio detail page
│   ├── layout.tsx
│   └── page.tsx                   # Main dashboard (watchlists + portfolios tabs)
├── components/
│   ├── charts/
│   │   ├── allocation-chart.tsx   # Pie chart for portfolio allocation
│   │   └── price-chart.tsx        # Line/candlestick price chart
│   ├── portfolio/
│   │   ├── add-holding-form.tsx
│   │   └── holdings-table.tsx
│   ├── ui/                        # shadcn/ui components
│   └── watchlist/
│       ├── add-symbol-form.tsx    # Symbol input with autocomplete
│       └── watchlist-table.tsx
├── lib/
│   ├── api/yahoo-finance.ts       # Yahoo Finance API wrapper
│   ├── db/
│   │   ├── index.ts               # Drizzle client
│   │   └── schema.ts              # Database schema
│   └── utils.ts                   # cn() utility
└── types/index.ts                 # Shared TypeScript types
```

## Database Schema

Tables defined in `src/lib/db/schema.ts`:

- **portfolios**: id, name, currency (USD/CAD), createdAt
- **holdings**: id, portfolioId, symbol, shares, avgCost, currency
- **transactions**: id, holdingId, type (buy/sell/dividend), shares, price, date
- **stock_cache**: symbol (PK), data (JSON), fetchedAt
- **watchlists**: id, name, createdAt
- **watchlist_items**: id, watchlistId, symbol, addedAt

After schema changes, run: `npx drizzle-kit push`

## Development

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # Run ESLint
```

Database file: `data/stocktrax.db`

## Docker Deployment

For containerized deployment, use an entrypoint script to initialize the database:

```bash
# entrypoint.sh
#!/bin/sh
npx drizzle-kit push
exec node server.js
```

- Mount a persistent volume for `/app/data` to preserve the SQLite database
- `drizzle-kit push` is idempotent: creates tables on first run, no-op on subsequent runs
- Safe to run on every container start

## API Patterns

- All API routes use Next.js Route Handlers in `src/app/api/`
- Zod for request validation
- Return `NextResponse.json()` with appropriate status codes
- Stock quotes cached in SQLite with TTL (1hr daily, 5min intraday)

## Key Features

- **Watchlists**: Track symbols with live prices, multiple watchlists via dropdown
- **Portfolios**: Track holdings with cost basis, gain/loss calculations
- **Price Charts**: Line and candlestick, time ranges (1Y/3M/5D/1D), preferences persisted per list
- **Symbol Search**: Autocomplete powered by Yahoo Finance search API

## Conventions

- Use `"use client"` directive for components with hooks/interactivity
- Prefer editing existing files over creating new ones
- UI components in `src/components/ui/` follow shadcn/ui patterns
- Types exported from `src/types/index.ts` and `src/lib/db/schema.ts`
- **NEVER commit or push unless explicitly asked by the user**
