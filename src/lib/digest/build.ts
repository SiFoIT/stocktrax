import { db, schema } from "@/lib/db";
import { gte } from "drizzle-orm";
import { getQuote, getHistoricalPricesMultiDate, getDividendInfo } from "@/lib/api/yahoo-finance";
import type { QuoteWithRange } from "@/lib/api/yahoo-finance";
import { getPortfolioSummary } from "@/lib/portfolio-summary";
import { getDigestConfig, type DigestConfig } from "@/lib/settings";
import { getSnapshotTotals } from "@/lib/digest/snapshots";
import {
  addDays,
  dateStrToUtc,
  digestWeek,
  formatDateLabel,
  formatMonthLabel,
  formatRangeLabel,
  utcToDateStr,
  weekdayName,
  zonedDateStr,
} from "@/lib/digest/time";
import {
  extremeNote,
  rangeNote,
  selectBestWorst,
  selectMovers,
  selectWatchlistRows,
  type MergedPosition,
} from "@/lib/digest/select";
import type {
  DailyDigestData,
  DigestFiftyTwoWeekNote,
  DigestHoldingRow,
  DigestMarketTile,
  DigestMover,
  DigestWatchlistGroup,
  DigestWatchlistRow,
  WeeklyDigestData,
} from "@/lib/digest/types";

/** The four tiles at the top of both emails. */
const MARKET_TILES: { symbol: string; label: string; isRate?: boolean }[] = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^GSPTSE", label: "TSX" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "CADUSD=X", label: "CAD/USD", isRate: true },
];

export {
  extremeNote,
  rangeNote,
  selectBestWorst,
  selectMovers,
  selectWatchlistRows,
  type MergedPosition,
} from "@/lib/digest/select";

// --- Shared data loading ---

interface QuoteBundle {
  quotes: Map<string, QuoteWithRange>;
  usdCad: number;
}

async function loadQuotes(symbols: string[]): Promise<QuoteBundle> {
  const unique = [...new Set(symbols)];
  const [fx, ...results] = await Promise.all([
    getQuote("USDCAD=X"),
    ...unique.map((symbol) => getQuote(symbol, true)),
  ]);

  const quotes = new Map<string, QuoteWithRange>();
  unique.forEach((symbol, i) => {
    const quote = results[i];
    if (quote) quotes.set(symbol, quote as QuoteWithRange);
  });

  return { quotes, usdCad: fx?.price ?? 1.36 };
}

/** Market tiles using each index's own daily change. */
async function loadDailyMarketTiles(): Promise<DigestMarketTile[]> {
  const results = await Promise.all(
    MARKET_TILES.map(async (tile) => {
      const quote = await getQuote(tile.symbol);
      return { tile, quote };
    })
  );

  return results.map(({ tile, quote }) => ({
    label: tile.label,
    changePercent: quote?.changePercent ?? null,
    rate: tile.isRate ? quote?.price : undefined,
  }));
}

/** Market tiles measured against the previous Friday's close. */
async function loadWeeklyMarketTiles(baseline: string): Promise<DigestMarketTile[]> {
  const target = dateStrToUtc(baseline);
  const results = await Promise.all(
    MARKET_TILES.map(async (tile) => {
      const [quote, history] = await Promise.all([
        getQuote(tile.symbol),
        getHistoricalPricesMultiDate(tile.symbol, [target]),
      ]);
      const base = history.get(target.getTime());
      const changePercent =
        quote?.price && base ? ((quote.price - base) / base) * 100 : null;
      return { tile, quote, changePercent };
    })
  );

  return results.map(({ tile, quote, changePercent }) => ({
    label: tile.label,
    changePercent,
    rate: tile.isRate ? quote?.price : undefined,
  }));
}

/**
 * Merge holdings by symbol. A stock held in two portfolios is one row in the
 * digest, with the shares summed, because the emails never break portfolios
 * out separately.
 */
function mergePositions(
  holdings: { symbol: string; shares: number; currency: string }[],
  quotes: Map<string, QuoteWithRange>,
  usdCad: number
): MergedPosition[] {
  const bySymbol = new Map<string, MergedPosition>();

  for (const holding of holdings) {
    const quote = quotes.get(holding.symbol);
    if (!quote) continue;

    const currency = quote.currency || holding.currency;
    const fx = currency === "USD" ? usdCad : 1;
    const existing = bySymbol.get(holding.symbol);

    if (existing) {
      existing.shares += holding.shares;
      existing.valueCad += holding.shares * quote.price * fx;
      continue;
    }

    bySymbol.set(holding.symbol, {
      symbol: holding.symbol,
      name: quote.shortName ?? holding.symbol,
      shares: holding.shares,
      price: quote.price,
      change: quote.change ?? 0,
      changePercent: quote.changePercent ?? 0,
      fx,
      valueCad: holding.shares * quote.price * fx,
    });
  }

  return [...bySymbol.values()];
}

/**
 * Transaction dates are date-only values stored as UTC midnight, so they are
 * compared as UTC calendar dates. Rendering them in the user's timezone would
 * shift each one a day earlier.
 */
function txDateStr(date: Date | string | number): string {
  return utcToDateStr(new Date(date));
}

// --- Daily ---

export async function buildDailyDigest(
  now = new Date(),
  config?: DigestConfig
): Promise<DailyDigestData> {
  const cfg = config ?? (await getDigestConfig());
  const today = zonedDateStr(now, cfg.timezone);

  const [summary, allHoldings, watchlistRows, watchlistItems, allTransactions] =
    await Promise.all([
      getPortfolioSummary(),
      db.query.holdings.findMany(),
      db.query.watchlists.findMany(),
      db.query.watchlistItems.findMany(),
      db.query.transactions.findMany(),
    ]);

  const activeHoldings = allHoldings.filter((h) => h.shares > 0);
  const watchlistSymbols =
    cfg.watchlistMovePct > 0 ? watchlistItems.map((item) => item.symbol) : [];

  const [markets, bundle] = await Promise.all([
    loadDailyMarketTiles(),
    loadQuotes([...activeHoldings.map((h) => h.symbol), ...watchlistSymbols]),
  ]);

  const positions = mergePositions(activeHoldings, bundle.quotes, bundle.usdCad);

  // Alerts carry a real timestamp, so they are matched in the user's timezone.
  const dayAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const recentAlerts = await db.query.alerts.findMany({
    where: gte(schema.alerts.triggeredAt, dayAgo),
  });
  const alerts = recentAlerts
    .filter((alert) => zonedDateStr(new Date(alert.triggeredAt), cfg.timezone) === today)
    .map((alert) => ({ symbol: alert.symbol, message: alert.message }));

  const holdingById = new Map(allHoldings.map((h) => [h.id, h]));
  const dividendTotals = new Map<string, number>();
  for (const txn of allTransactions) {
    if (txn.type !== "dividend") continue;
    if (txDateStr(txn.date) !== today) continue;
    const holding = holdingById.get(txn.holdingId);
    if (!holding) continue;
    const quote = bundle.quotes.get(holding.symbol);
    const currency = quote?.currency || holding.currency;
    const fx = currency === "USD" ? bundle.usdCad : 1;
    const amount = txn.shares * txn.price * fx;
    dividendTotals.set(holding.symbol, (dividendTotals.get(holding.symbol) ?? 0) + amount);
  }

  const watchlistNameById = new Map(watchlistRows.map((w) => [w.id, w.name]));
  const watchlistCandidates: DigestWatchlistRow[] = watchlistItems
    .filter((item) => watchlistNameById.has(item.watchlistId))
    .map((item) => {
      const quote = bundle.quotes.get(item.symbol);
      if (!quote) return null;
      return {
        symbol: item.symbol,
        name: quote.shortName ?? item.symbol,
        price: quote.price,
        changePercent: quote.changePercent ?? 0,
      };
    })
    .filter((row): row is DigestWatchlistRow => row !== null);

  // The same symbol on two watchlists should appear once.
  const uniqueWatchlist = [
    ...new Map(watchlistCandidates.map((row) => [row.symbol, row])).values(),
  ];

  const totals = summary.totals;
  const portfolio =
    summary.portfolios.length > 0
      ? {
          value: totals.marketValue,
          change: totals.todayReturn,
          changePercent: totals.todayReturnPercent,
        }
      : null;

  return {
    kind: "daily",
    dateLabel: formatDateLabel(today),
    markets,
    portfolio,
    movers: selectMovers(positions),
    watchlist: selectWatchlistRows(uniqueWatchlist, cfg.watchlistMovePct),
    watchlistThreshold: cfg.watchlistMovePct,
    alerts,
    dividends: [...dividendTotals.entries()]
      .map(([symbol, amount]) => ({ symbol, amount }))
      .sort((a, b) => b.amount - a.amount),
    appUrl: cfg.appUrl,
  };
}

// --- Weekly ---

export async function buildWeeklyDigest(
  now = new Date(),
  config?: DigestConfig
): Promise<WeeklyDigestData> {
  const cfg = config ?? (await getDigestConfig());
  const today = zonedDateStr(now, cfg.timezone);
  const week = digestWeek(today);
  const baselineDate = dateStrToUtc(week.baseline);

  const [
    summary,
    allHoldings,
    watchlistRows,
    watchlistItems,
    allTransactions,
    allCashTransactions,
  ] = await Promise.all([
    getPortfolioSummary(),
    db.query.holdings.findMany(),
    db.query.watchlists.findMany(),
    db.query.watchlistItems.findMany(),
    db.query.transactions.findMany(),
    db.query.cashTransactions.findMany(),
  ]);

  const activeHoldings = allHoldings.filter((h) => h.shares > 0);
  const watchlistSymbols = watchlistItems.map((item) => item.symbol);
  const allSymbols = [...new Set([...activeHoldings.map((h) => h.symbol), ...watchlistSymbols])];

  const [markets, bundle, baselinePrices] = await Promise.all([
    loadWeeklyMarketTiles(week.baseline),
    loadQuotes(allSymbols),
    Promise.all(
      allSymbols.map(async (symbol) => {
        const history = await getHistoricalPricesMultiDate(symbol, [baselineDate]);
        return [symbol, history.get(baselineDate.getTime())] as const;
      })
    ).then((entries) => new Map(entries.filter(([, price]) => price != null) as [string, number][])),
  ]);

  const positions = mergePositions(activeHoldings, bundle.quotes, bundle.usdCad);

  // Week movers, priced against the previous Friday's close.
  const weekMovers: DigestMover[] = [];
  const holdingRows: DigestHoldingRow[] = [];
  for (const position of positions) {
    const base = baselinePrices.get(position.symbol);
    if (!base) continue;
    const weekPercent = ((position.price - base) / base) * 100;
    const weekAmount = (position.price - base) * position.shares * position.fx;
    weekMovers.push({
      symbol: position.symbol,
      name: position.name,
      changePercent: weekPercent,
      changeAmount: weekAmount,
    });
    holdingRows.push({
      symbol: position.symbol,
      price: position.price,
      weekPercent,
      value: position.valueCad,
      weekAmount,
    });
  }
  holdingRows.sort((a, b) => b.weekPercent - a.weekPercent);
  const { best, worst } = selectBestWorst(weekMovers);

  // Portfolio week change: a stored snapshot is authoritative because it
  // survives mid-week trades. Without one, re-price today's shares a week back
  // and label the result estimated.
  const totals = summary.totals;
  const snapshot = await getSnapshotTotals(week.baseline);
  let portfolio: WeeklyDigestData["portfolio"] = null;

  if (summary.portfolios.length > 0) {
    if (snapshot && snapshot.marketValue > 0) {
      const change = totals.marketValue - snapshot.marketValue;
      portfolio = {
        value: totals.marketValue,
        change,
        changePercent: (change / snapshot.marketValue) * 100,
        estimated: false,
      };
    } else {
      let startValue = 0;
      for (const position of positions) {
        const base = baselinePrices.get(position.symbol);
        if (base) startValue += base * position.shares * position.fx;
      }
      const change = startValue > 0 ? totals.marketValue - startValue : 0;
      portfolio = {
        value: totals.marketValue,
        change,
        changePercent: startValue > 0 ? (change / startValue) * 100 : 0,
        estimated: true,
      };
    }
  }

  const earliest = new Date(totals.earliestTransactionDate);
  const years = (now.getTime() - earliest.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const allTime =
    summary.portfolios.length > 0 && totals.costBasis > 0
      ? {
          amount: totals.gainLoss,
          percent: totals.gainLossPercent,
          sinceLabel: formatMonthLabel(earliest),
          cagr: totals.cagr,
          years,
        }
      : null;

  // 52-week extremes across both holdings and watchlist symbols.
  const fiftyTwoWeek: DigestFiftyTwoWeekNote[] = [];
  for (const symbol of allSymbols) {
    const quote = bundle.quotes.get(symbol);
    if (!quote) continue;
    const kind = extremeNote(quote.price, quote.fiftyTwoWeekHigh, quote.fiftyTwoWeekLow);
    if (kind) fiftyTwoWeek.push({ symbol, kind });
  }

  const holdingById = new Map(allHoldings.map((h) => [h.id, h]));
  const inWeek = (dateStr: string) => dateStr >= week.start && dateStr <= week.end;
  const cadOf = (symbol: string, fallbackCurrency: string) => {
    const currency = bundle.quotes.get(symbol)?.currency || fallbackCurrency;
    return currency === "USD" ? bundle.usdCad : 1;
  };

  let weekDividends = 0;
  let ytdDividends = 0;
  const dividendSymbols = new Set<string>();
  let buys = 0;
  let sells = 0;
  const currentYear = Number(today.slice(0, 4));

  for (const txn of allTransactions) {
    const holding = holdingById.get(txn.holdingId);
    if (!holding) continue;
    const dateStr = txDateStr(txn.date);
    const amount = txn.shares * txn.price * cadOf(holding.symbol, holding.currency);

    if (txn.type === "dividend") {
      if (Number(dateStr.slice(0, 4)) === currentYear) ytdDividends += amount;
      if (inWeek(dateStr)) {
        weekDividends += amount;
        dividendSymbols.add(holding.symbol);
      }
    } else if (inWeek(dateStr)) {
      if (txn.type === "buy") buys++;
      else if (txn.type === "sell") sells++;
    }
  }

  let netCash = 0;
  for (const cash of allCashTransactions) {
    if (!inWeek(txDateStr(cash.date))) continue;
    netCash += cash.currency === "USD" ? cash.amount * bundle.usdCad : cash.amount;
  }

  // Ex-dividend dates falling in the coming Monday–Friday.
  const nextMonday = addDays(week.end, 3);
  const nextFriday = addDays(week.end, 7);
  const dividendInfos = await Promise.all(
    positions.map(async (position) => ({
      symbol: position.symbol,
      info: await getDividendInfo(position.symbol),
    }))
  );
  const nextWeekExDiv = dividendInfos
    .filter(({ info }) => {
      const date = info.exDividendDate;
      return date !== undefined && date >= nextMonday && date <= nextFriday;
    })
    .map(({ symbol, info }) => ({
      symbol,
      weekday: weekdayName(info.exDividendDate as string),
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const weekStartUtc = dateStrToUtc(week.start);
  const weekAlerts = (
    await db.query.alerts.findMany({ where: gte(schema.alerts.triggeredAt, weekStartUtc) })
  ).filter((alert) => {
    const dateStr = zonedDateStr(new Date(alert.triggeredAt), cfg.timezone);
    return inWeek(dateStr);
  });

  const alertCounts = new Map<string, number>();
  for (const alert of weekAlerts) {
    alertCounts.set(alert.symbol, (alertCounts.get(alert.symbol) ?? 0) + 1);
  }
  const topAlert = [...alertCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const topHoldingItem = summary.breakdowns.topHoldings[0];
  const topHolding =
    topHoldingItem && totals.marketValue > 0
      ? {
          symbol: topHoldingItem.name,
          percent: (topHoldingItem.value / totals.marketValue) * 100,
        }
      : null;

  // One table per watchlist, since watchlists are the user's own grouping.
  const watchlists: DigestWatchlistGroup[] = watchlistRows
    .map((list) => {
      const rows = watchlistItems
        .filter((item) => item.watchlistId === list.id)
        .map((item): DigestWatchlistRow | null => {
          const quote = bundle.quotes.get(item.symbol);
          const base = baselinePrices.get(item.symbol);
          if (!quote) return null;
          return {
            symbol: item.symbol,
            name: quote.shortName ?? item.symbol,
            price: quote.price,
            changePercent: base ? ((quote.price - base) / base) * 100 : 0,
            rangeNote: rangeNote(quote.price, quote.fiftyTwoWeekHigh, quote.fiftyTwoWeekLow),
          };
        })
        .filter((row): row is DigestWatchlistRow => row !== null)
        .sort((a, b) => b.changePercent - a.changePercent);
      return { name: list.name, rows };
    })
    .filter((group) => group.rows.length > 0);

  return {
    kind: "weekly",
    rangeLabel: formatRangeLabel(week.start, week.end),
    markets,
    portfolio,
    allTime,
    best,
    worst,
    facts: {
      fiftyTwoWeek,
      dividends:
        weekDividends > 0
          ? { total: weekDividends, symbols: [...dividendSymbols].sort(), ytd: ytdDividends }
          : null,
      nextWeekExDiv,
      activity: buys > 0 || sells > 0 || netCash !== 0 ? { buys, sells, netCash } : null,
      alerts:
        weekAlerts.length > 0
          ? {
              count: weekAlerts.length,
              topSymbol: topAlert?.[0] ?? null,
              topCount: topAlert?.[1] ?? 0,
            }
          : null,
      topHolding,
    },
    holdings: holdingRows,
    watchlists,
    appUrl: cfg.appUrl,
  };
}
