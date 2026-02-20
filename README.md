# StockTrax

A self-hosted stock portfolio and watchlist tracker with real-time market data, interactive charts, and transaction management. Built with Next.js and SQLite — no external database required.

## Features

### Market Overview
- Global indices, commodities, currencies, and crypto at a glance
- Sparkline charts and market status indicators (open / pre-market / closed)

### Watchlists
- Multiple named watchlists with symbol autocomplete search
- Sub-views: **Performance**, **Dividend**, and **News**
- Real-time quotes with pre/post-market price data
- 52-week and daily high/low range bars with distance percentages
- Sortable columns across all views

### Portfolios
- Multiple portfolios with full transaction history (buy / sell / dividend)
- Holdings computed automatically from transactions
- Cash balance tracking in CAD and USD with exchange rate conversion
- Sub-views: **Holdings**, **Performance**, **Dividend**, **Dividend Returns**, **News**, **Transactions**
- Portfolio analytics: CAGR, sector allocation, asset type breakdown, currency distribution
- CSV import for bulk transaction entry with duplicate detection

### Interactive Charts
- Line and candlestick charts powered by TradingView lightweight-charts
- Time ranges: 1D, 5D, 3M, 1Y, 5Y
- Technical indicators: 50/200 SMA, 12/26 EMA, Bollinger Bands, volume
- Per-list chart preferences persisted in localStorage

### Stock Screener
- Screen across all stocks, a watchlist, or portfolio holdings
- Filter by price, moving averages, performance, valuation, dividends, profitability, risk, and analyst metrics
- Combine rules with match-all or match-any logic

### Alerts
- Set price and performance alert rules on watchlist items or holdings
- Reset strategies: manual, recovery, cooldown, baseline, end of day
- Alert history tracking and triggered alert badges

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16, React 19, App Router |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| Styling | Tailwind CSS 4 |
| UI | Radix UI + shadcn/ui patterns |
| Charts | TradingView lightweight-charts, Recharts |
| Market Data | yahoo-finance2 (15–20 min delayed, cached) |
| Validation | Zod |

## Getting Started

### Prerequisites

- Node.js 22+
- npm

### Development

```bash
# Install dependencies
npm install

# Initialize the database
npx drizzle-kit push

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Docker

### Quick Start with Docker Compose

```yaml
services:
  stocktrax:
    image: ghcr.io/sifoIt/stocktrax:latest
    ports:
      - "3000:3000"
    volumes:
      - stocktrax-data:/app/data
    restart: unless-stopped

volumes:
  stocktrax-data:
```

```bash
docker compose up -d
```

### Build Locally

```bash
docker build -t stocktrax .
docker run -p 3000:3000 -v stocktrax-data:/app/data stocktrax
```

The container runs database migrations automatically on startup. Mount `/app/data` to persist the SQLite database across restarts.

## CI/CD

Pushing a version tag (`v*`) triggers a GitHub Actions workflow that builds and publishes the Docker image to GitHub Container Registry (GHCR).

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Project Structure

```
src/
├── app/
│   ├── api/           # Route handlers (portfolios, holdings, transactions, etc.)
│   ├── portfolio/     # Portfolio detail page
│   ├── layout.tsx
│   └── page.tsx       # Dashboard (general, watchlists, portfolios, screener)
├── components/
│   ├── charts/        # Price charts, allocation charts, sparklines
│   ├── portfolio/     # Holdings, transactions, performance, cash
│   ├── ui/            # shadcn/ui primitives
│   ├── watchlist/     # Watchlist tables and forms
│   ├── alerts/        # Alert rules and history
│   └── screens/       # Stock screener
├── lib/
│   ├── api/           # Yahoo Finance wrapper
│   ├── db/            # Drizzle client and schema
│   └── utils.ts       # Shared utilities
└── types/             # TypeScript type definitions
```

## Data Sources

Stock quotes and market data are provided by [Yahoo Finance](https://finance.yahoo.com/) via the yahoo-finance2 library. Data is delayed 15–20 minutes and cached locally (1 hour for daily data, 5 minutes for intraday).
