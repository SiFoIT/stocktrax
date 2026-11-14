import { db, schema } from "@/lib/db";
import { gte } from "drizzle-orm";
import { getQuote, getDailyHistory, getDividendInfo } from "@/lib/api/yahoo-finance";
import type { DailyHistory, QuoteWithRange } from "@/lib/api/yahoo-finance";
import { addMonths, closeOnOrBeforeDay, splitFactorAfter } from "@/lib/returns";
import { resolveUsdCadRate } from "@/lib/fx";
import { getPortfolioSummary } from "@/lib/portfolio-summary";
import { getDigestConfig, type DigestConfig } from "@/lib/settings";
import { loadPortfolioCoverage } from "@/lib/import/coverage";
import { selectImportReminder } from "@/lib/digest/import-reminder";
import {
  addDays,
  dateStrToUtc,
  digestWeek,
  formatDateLabel,
  formatMonthLabel,
  formatRangeLabel,
  MARKET_TIMEZONE,
  utcToDateStr,
  weekdayName,
  zonedDateStr,
} from "@/lib/digest/time";
import {
  rangeNote,
  selectBestWorst,
  selectMovers,
  selectWatchlistRows,
  weeklyExtreme,
  type MergedPosition,
} from "@/lib/digest/select";
import type { AlertMetric } from "@/lib/alerts/config";
import type {
  DailyDigestData,
  DigestAlertRow,
  DigestFiftyTwoWeekNote,
  DigestHoldingRow,
  DigestMarketTile,
  DigestMover,
  DigestPortfolioRow,
  DigestPortfolioSection,
  DigestWatchlistGroup,
  DigestWatchlistRow,
  WeeklyDigestData,
} from "@/lib/digest/types";

/**
 * The four tiles at the top of both emails. Index levels are whole numbers —
 * four or five digits leave no room for decimals beside the change — while the
 * FX rate needs three to say anything at all.
 */
const MARKET_TILES: { symbol: string; label: string; decimals: number }[] = [
  { symbol: "^GSPC", label: "S&P 500", decimals: 0 },
  { symbol: "^GSPTSE", label: "TSX", decimals: 0 },
  { symbol: "^IXIC", label: "Nasdaq", decimals: 0 },
  { symbol: "CADUSD=X", label: "CAD/USD", decimals: 3 },
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

  return { quotes, usdCad: (await resolveUsdCadRate(fx?.price)).rate };
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
    value: quote?.price ?? null,
    decimals: tile.decimals,
    changePercent: quote?.changePercent ?? null,
  }));
}

/** Market tiles measured against the previous Friday's close. */
async function loadWeeklyMarketTiles(baseline: string): Promise<DigestMarketTile[]> {
  const results = await Promise.all(
    MARKET_TILES.map(async (tile) => {
      const [quote, history] = await Promise.all([
        getQuote(tile.symbol),
        getDailyHistory(tile.symbol, addDays(baseline, -10)),
      ]);
      const base = history ? closeOnOrBeforeDay(history.bars, baseline) : null;
      const changePercent =
        quote?.price && base ? ((quote.price - base) / base) * 100 : null;
      return { tile, quote, changePercent };
    })
  );

  return results.map(({ tile, quote, changePercent }) => ({
    label: tile.label,
    value: quote?.price ?? null,
    decimals: tile.decimals,
    changePercent,
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
      currency,
      change: quote.change ?? 0,
      changePercent: quote.changePercent ?? 0,
      fx,
      valueCad: holding.shares * quote.price * fx,
    });
  }

  return [...bySymbol.values()];
}

/**
 * Rows plus a total. A lone portfolio stands on its own: a "Total" underneath
 * one row would only repeat it.
 */
function toSection(
  rows: DigestPortfolioRow[],
  total: DigestPortfolioRow
): DigestPortfolioSection | null {
  if (rows.length === 0) return null;
  return { rows, total: rows.length > 1 ? total : null };
}

/**
 * Transaction dates are date-only values stored as UTC midnight, so they are
 * compared as UTC calendar dates. Rendering them in the user's timezone would
 * shift each one a day earlier.
 */
function txDateStr(date: Date | string | number): string {
  return utcToDateStr(new Date(date));
}

/**
 * Alerts that fired since `since` and on a day `inPeriod` accepts, one row per
 * rule: its latest firing plus how many times it fired.
 */
async function loadAlerts(
  since: Date,
  inPeriod: (dateStr: string) => boolean
): Promise<DigestAlertRow[]> {
  const [fired, rules] = await Promise.all([
    db.query.alerts.findMany({ where: gte(schema.alerts.triggeredAt, since) }),
    db.query.alertRules.findMany(),
  ]);
  const metricByRule = new Map(rules.map((rule) => [rule.id, rule.metric as AlertMetric]));

  const byRule = new Map<number, { alert: (typeof fired)[number]; count: number }>();
  for (const alert of fired) {
    if (!inPeriod(zonedDateStr(new Date(alert.triggeredAt), MARKET_TIMEZONE))) continue;
    const seen = byRule.get(alert.ruleId);
    if (!seen) {
      byRule.set(alert.ruleId, { alert, count: 1 });
    } else {
      seen.count += 1;
      if (new Date(alert.triggeredAt) > new Date(seen.alert.triggeredAt)) seen.alert = alert;
    }
  }

  return [...byRule.values()]
    .sort((a, b) => new Date(b.alert.triggeredAt).getTime() - new Date(a.alert.triggeredAt).getTime())
    .map(({ alert, count }) => {
      const metric = metricByRule.get(alert.ruleId) ?? null;
      return {
        symbol: alert.symbol,
        metric,
        value: metric === "last_price" ? (alert.price ?? alert.metricValue) : alert.metricValue,
        operator: alert.operator,
        threshold: alert.threshold,
        message: alert.message,
        count,
      };
    });
}

/** The foot-of-email import reminder, in the user's own timezone. */
async function loadImportReminder(now: Date, cfg: DigestConfig) {
  if (!cfg.importReminderEnabled) return null;
  const coverage = await loadPortfolioCoverage();
  return selectImportReminder(
    zonedDateStr(now, cfg.timezone),
    coverage,
    cfg.importReminderPortfolios
  );
}

// --- Daily ---

export async function buildDailyDigest(
  now = new Date(),
  config?: DigestConfig
): Promise<DailyDigestData> {
  const cfg = config ?? (await getDigestConfig());
  const today = zonedDateStr(now, MARKET_TIMEZONE);

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
  const alerts = await loadAlerts(dayAgo, (dateStr) => dateStr === today);

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
    .map((item): DigestWatchlistRow | null => {
      const quote = bundle.quotes.get(item.symbol);
      if (!quote) return null;
      return {
        symbol: item.symbol,
        name: quote.shortName ?? item.symbol,
        price: quote.price,
        currency: quote.currency,
        changePercent: quote.changePercent ?? 0,
      };
    })
    .filter((row): row is DigestWatchlistRow => row !== null);

  // The same symbol on two watchlists should appear once.
  const uniqueWatchlist = [
    ...new Map(watchlistCandidates.map((row) => [row.symbol, row])).values(),
  ];

  const totals = summary.totals;
  const dayRows: DigestPortfolioRow[] = summary.portfolios
    .filter((p) => p.marketValue > 0)
    .sort((a, b) => b.marketValue - a.marketValue)
    .map((p) => ({
      name: p.name,
      value: p.marketValue,
      change: p.todayReturn,
      changePercent: p.todayReturnPercent,
    }));
  const portfolio = toSection(dayRows, {
    name: "Total",
    value: totals.marketValue,
    change: totals.todayReturn,
    changePercent: totals.todayReturnPercent,
  });

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
    importReminder: await loadImportReminder(now, cfg),
    appUrl: cfg.appUrl,
  };
}

// --- Weekly ---

export async function buildWeeklyDigest(
  now = new Date(),
  config?: DigestConfig
): Promise<WeeklyDigestData> {
  const cfg = config ?? (await getDigestConfig());
  const today = zonedDateStr(now, MARKET_TIMEZONE);
  const week = digestWeek(today);

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

  // A year and a bit of daily closes per symbol: the week's baseline close
  // and the 52-week window the "new high/low" facts are judged against.
  const yearStart = addMonths(week.end, -12);
  const historyFrom = addDays(yearStart, -10);

  const [markets, bundle, histories] = await Promise.all([
    loadWeeklyMarketTiles(week.baseline),
    loadQuotes(allSymbols),
    Promise.all(allSymbols.map((symbol) => getDailyHistory(symbol, historyFrom))),
  ]);
  const historyBySymbol = new Map<string, DailyHistory>();
  allSymbols.forEach((symbol, i) => {
    const history = histories[i];
    if (history) historyBySymbol.set(symbol, history);
  });
  /** Friday's close in today's share units, or null if unavailable. */
  const baselineClose = (symbol: string): number | null => {
    const history = historyBySymbol.get(symbol);
    return history ? closeOnOrBeforeDay(history.bars, week.baseline) : null;
  };

  const positions = mergePositions(activeHoldings, bundle.quotes, bundle.usdCad);

  const cadOf = (symbol: string, fallbackCurrency: string) => {
    const currency = bundle.quotes.get(symbol)?.currency || fallbackCurrency;
    return currency === "USD" ? bundle.usdCad : 1;
  };

  const holdingById = new Map(allHoldings.map((h) => [h.id, h]));

  // Shares held at Friday's close and money moved since, per symbol, from the
  // transaction ledger: a holding's week in dollars is its value now less its
  // value then, less what was bought into it and plus what was sold out.
  const sharesAtBaseline = new Map<string, number>();
  const netBoughtSince = new Map<string, number>();
  for (const txn of [...allTransactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id
  )) {
    const holding = holdingById.get(txn.holdingId);
    if (!holding) continue;
    const symbol = holding.symbol;
    const sign = txn.type === "buy" || txn.type === "transfer_in" ? 1 : txn.type === "sell" ? -1 : 0;
    if (sign === 0) continue;
    if (txDateStr(txn.date) <= week.baseline) {
      sharesAtBaseline.set(symbol, Math.max(0, (sharesAtBaseline.get(symbol) ?? 0) + sign * txn.shares));
    } else {
      netBoughtSince.set(symbol, (netBoughtSince.get(symbol) ?? 0) + sign * txn.shares * txn.price);
    }
  }

  // Week movers, priced against the previous Friday's close.
  const weekMovers: DigestMover[] = [];
  const holdingRows: DigestHoldingRow[] = [];
  for (const position of positions) {
    const currency = bundle.quotes.get(position.symbol)?.currency;
    const base = baselineClose(position.symbol);
    if (base == null) {
      holdingRows.push({
        symbol: position.symbol,
        price: position.price,
        currency,
        weekPercent: null,
        value: position.valueCad,
        weekAmount: null,
      });
      continue;
    }
    const weekPercent = ((position.price - base) / base) * 100;
    const units =
      (sharesAtBaseline.get(position.symbol) ?? 0) *
      splitFactorAfter(historyBySymbol.get(position.symbol)?.splits ?? [], week.baseline);
    const weekAmount =
      (position.shares * position.price - units * base - (netBoughtSince.get(position.symbol) ?? 0)) *
      position.fx;
    weekMovers.push({
      symbol: position.symbol,
      name: position.name,
      price: position.price,
      currency,
      changePercent: weekPercent,
    });
    holdingRows.push({
      symbol: position.symbol,
      price: position.price,
      currency,
      weekPercent,
      value: position.valueCad,
      weekAmount,
    });
  }
  holdingRows.sort((a, b) => (b.weekPercent ?? -Infinity) - (a.weekPercent ?? -Infinity));
  const { best, worst } = selectBestWorst(weekMovers);

  // Portfolio week change comes from the summary, which values the Friday
  // position from the transaction ledger and nets out trades since, so a buy
  // made with cash this week is not reported as a gain. A row whose figure
  // could not be computed shows a dash.
  const totals = summary.totals;
  const weekRows: DigestPortfolioRow[] = summary.portfolios
    .filter((p) => p.marketValue > 0)
    .sort((a, b) => b.marketValue - a.marketValue)
    .map((p) => ({
      name: p.name,
      value: p.marketValue,
      change: p.weekReturn?.amount ?? null,
      changePercent: p.weekReturn?.percent ?? null,
    }));
  const portfolio = toSection(weekRows, {
    name: "Total",
    value: totals.marketValue,
    change: totals.weekReturn?.amount ?? null,
    changePercent: totals.weekReturn?.percent ?? null,
  });

  const earliest = new Date(totals.earliestTransactionDate);
  const years = (now.getTime() - earliest.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const allTime =
    summary.portfolios.length > 0 && totals.sinceInception
      ? {
          amount: totals.sinceInception.amount,
          percent: totals.sinceInception.percent,
          sinceLabel: formatMonthLabel(earliest),
          cagr: totals.cagr,
          years,
        }
      : null;

  // 52-week extremes set during the week, across holdings and watchlist.
  const fiftyTwoWeek: DigestFiftyTwoWeekNote[] = [];
  for (const symbol of allSymbols) {
    const history = historyBySymbol.get(symbol);
    if (!history) continue;
    const kind = weeklyExtreme(history.bars, week.baseline, week.end, yearStart);
    if (kind) fiftyTwoWeek.push({ symbol, kind });
  }

  const inWeek = (dateStr: string) => dateStr >= week.start && dateStr <= week.end;

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

  // Fetch from a day early: `inWeek` matches on the ET calendar day, so the
  // query must not cut off alerts fired before noon UTC on Monday.
  const alerts = await loadAlerts(dateStrToUtc(addDays(week.start, -1)), inWeek);

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
          const base = baselineClose(item.symbol);
          if (!quote) return null;
          return {
            symbol: item.symbol,
            name: quote.shortName ?? item.symbol,
            price: quote.price,
            currency: quote.currency,
            changePercent: base ? ((quote.price - base) / base) * 100 : null,
            rangeNote: rangeNote(quote.price, quote.fiftyTwoWeekHigh, quote.fiftyTwoWeekLow),
          };
        })
        .filter((row): row is DigestWatchlistRow => row !== null)
        .sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity));
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
    alerts,
    facts: {
      fiftyTwoWeek,
      dividends:
        weekDividends > 0
          ? { total: weekDividends, symbols: [...dividendSymbols].sort(), ytd: ytdDividends }
          : null,
      nextWeekExDiv,
      activity: buys > 0 || sells > 0 || netCash !== 0 ? { buys, sells, netCash } : null,
      topHolding,
    },
    holdings: holdingRows,
    watchlists,
    importReminder: await loadImportReminder(now, cfg),
    appUrl: cfg.appUrl,
  };
}
