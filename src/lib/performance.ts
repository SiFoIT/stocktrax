import { db, schema } from "@/lib/db";
import { like } from "drizzle-orm";
import { getDailyHistory, getQuote, type DailyHistory } from "@/lib/api/yahoo-finance";
import { readCacheRow, writeCacheRow } from "@/lib/market-data/cache";
import { addDays, MARKET_TIMEZONE, zonedDateStr } from "@/lib/digest/time";
import { addMonths, closeOnOrBeforeDay, isMarketDay, splitFactorAfter } from "@/lib/returns";
import { annualized, EXTERNAL_CASH_TYPES, modifiedDietz, simulateBenchmark, type Flow } from "@/lib/performance-math";
import type { PerformanceData, PerformanceReturns } from "@/types";

/**
 * Account value over time and a like-for-like benchmark comparison.
 *
 * The transaction and cash ledgers are replayed day by day: positions are
 * priced at each session's close (split-adjusted) and converted at that day's
 * USD/CAD rate, and the cash balance follows every deposit, trade and
 * dividend. "Contributed" is external money only — deposits, contributions,
 * transfers in and out (cash or shares) — so the gap between the two lines is
 * what the account earned.
 *
 * Each benchmark receives exactly the same external flows on the same days,
 * so "would the money have done better in XEQT?" compares like with like,
 * whatever the timing of the deposits.
 */

export const BENCHMARKS = [
  { symbol: "XEQT.TO", label: "XEQT" },
  { symbol: "^GSPTSE", label: "TSX" },
] as const;


const CACHE_PREFIX = "PERF_V1:";
const CACHE_TTL_MS = 15 * 60_000;

const txDay = (date: Date | string | number) => new Date(date).toISOString().slice(0, 10);

/** Drop cached performance results; called with the summary invalidation. */
export async function invalidatePerformance(): Promise<void> {
  await db.delete(schema.stockCache).where(like(schema.stockCache.symbol, `${CACHE_PREFIX}%`));
}

export async function getPerformance(portfolioId?: number): Promise<PerformanceData | null> {
  const key = `${CACHE_PREFIX}${portfolioId ?? "all"}`;
  const hit = await readCacheRow<PerformanceData>(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.value;
  const data = await computePerformance(portfolioId);
  // An incomplete result is still returned, but not kept for long.
  if (data) await writeCacheRow(key, data, new Date(data.missing.length > 0 ? Date.now() - CACHE_TTL_MS + 60_000 : Date.now()));
  return data;
}

async function computePerformance(portfolioId?: number): Promise<PerformanceData | null> {
  const [portfolios, holdings, transactions, cash] = await Promise.all([
    db.query.portfolios.findMany(),
    db.query.holdings.findMany(),
    db.query.transactions.findMany(),
    db.query.cashTransactions.findMany(),
  ]);
  const inScope = new Set(
    portfolios.filter((p) => portfolioId == null || p.id === portfolioId).map((p) => p.id)
  );
  if (inScope.size === 0) return null;

  const holdingById = new Map(holdings.filter((h) => inScope.has(h.portfolioId)).map((h) => [h.id, h]));
  const txns = transactions
    .filter((t) => holdingById.has(t.holdingId))
    .map((t) => ({ ...t, day: txDay(t.date) }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.id - b.id));
  const cashRows = cash
    .filter((c) => inScope.has(c.portfolioId))
    .map((c) => ({ ...c, day: txDay(c.date) }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.id - b.id));

  const firstDay = [txns[0]?.day, cashRows[0]?.day].filter(Boolean).sort()[0];
  if (!firstDay) return null;
  const today = zonedDateStr(new Date(), MARKET_TIMEZONE);
  const from = addDays(firstDay, -10);

  const symbols = [...new Set([...holdingById.values()].map((h) => h.symbol))];
  const [histories, fxHistory, benchHistories, fxQuote] = await Promise.all([
    Promise.all(symbols.map((s) => getDailyHistory(s, from))),
    getDailyHistory("USDCAD=X", from),
    Promise.all(BENCHMARKS.map((b) => getDailyHistory(b.symbol, from))),
    getQuote("USDCAD=X", true),
  ]);
  const historyBySymbol = new Map<string, DailyHistory>();
  const missing: string[] = [];
  symbols.forEach((s, i) => {
    if (histories[i]) historyBySymbol.set(s, histories[i]!);
    else missing.push(s);
  });

  // Each holding's currency, from its quote when held, else its record.
  const currencyOf = new Map<string, string>();
  await Promise.all(
    symbols.map(async (s) => {
      const q = (await getQuote(s, true)) as { currency?: string } | null;
      const record = [...holdingById.values()].find((h) => h.symbol === s);
      currencyOf.set(s, q?.currency || record?.currency || "CAD");
    })
  );

  const fallbackFx = (fxQuote?.price as number | undefined) ?? 1.4;
  const fxOn = (day: string) => (fxHistory ? closeOnOrBeforeDay(fxHistory.bars, day) : null) ?? fallbackFx;
  const toCad = (amount: number, currency: string, day: string) =>
    currency === "USD" ? amount * fxOn(day) : amount;

  // Every session from the first activity to today.
  const days: string[] = [];
  for (let d = firstDay; d <= today; d = addDays(d, 1)) if (isMarketDay(d) || d === today) days.push(d);

  const flows: Flow[] = [];
  const positions = new Map<number, number>();
  const lastTradePrice = new Map<number, number>();
  let cashCad = 0;
  let ti = 0;
  let ci = 0;
  let contributed = 0;

  const values: number[] = [];
  const contributedSeries: number[] = [];

  for (const day of days) {
    while (ci < cashRows.length && cashRows[ci].day <= day) {
      const c = cashRows[ci++];
      const amount = toCad(c.amount, c.currency, c.day);
      cashCad += amount;
      if (EXTERNAL_CASH_TYPES.has(c.type) && amount !== 0) {
        flows.push({ day: c.day, amount });
        contributed += amount;
      }
    }
    while (ti < txns.length && txns[ti].day <= day) {
      const t = txns[ti++];
      const h = holdingById.get(t.holdingId)!;
      const currency = currencyOf.get(h.symbol) ?? h.currency;
      const value = toCad(t.shares * t.price, currency, t.day);
      const held = positions.get(t.holdingId) ?? 0;
      if (t.type === "buy") {
        positions.set(t.holdingId, held + t.shares);
        cashCad -= value;
      } else if (t.type === "sell") {
        positions.set(t.holdingId, Math.max(0, held - t.shares));
        cashCad += value;
      } else if (t.type === "dividend") {
        cashCad += value;
      } else if (t.type === "transfer_in") {
        positions.set(t.holdingId, held + t.shares);
        // Shares moved in from outside are external money, at their cost or,
        // when recorded at $0 (a split or distribution), not money at all.
        if (value > 0) {
          flows.push({ day: t.day, amount: value });
          contributed += value;
        }
      }
      if (t.price > 0 && t.type !== "dividend") lastTradePrice.set(t.holdingId, t.price);
    }

    let holdingsValue = 0;
    for (const [holdingId, shares] of positions) {
      if (shares <= 1e-9) continue;
      const h = holdingById.get(holdingId)!;
      const history = historyBySymbol.get(h.symbol);
      const close = history ? closeOnOrBeforeDay(history.bars, day) : null;
      const units = history ? shares * splitFactorAfter(history.splits, day) : shares;
      const price = close ?? lastTradePrice.get(holdingId) ?? 0;
      holdingsValue += toCad((close != null ? units : shares) * price, currencyOf.get(h.symbol) ?? h.currency, day);
    }
    values.push(holdingsValue + cashCad);
    contributedSeries.push(contributed);
  }

  const benchSeries = BENCHMARKS.map((b, i) => {
    const history = benchHistories[i];
    if (!history) return null;
    return simulateBenchmark(flows, days, (day) => closeOnOrBeforeDay(history.bars, day));
  });

  const endDay = days[days.length - 1];
  const valueOn = (series: number[], day: string) => {
    let v = 0;
    for (let i = 0; i < days.length && days[i] <= day; i++) v = series[i];
    return v;
  };
  const returnsFor = (series: number[]): PerformanceReturns => {
    const end = series[series.length - 1];
    const ytdStart = `${Number(today.slice(0, 4)) - 1}-12-31`;
    const oneYearStart = addMonths(today, -12);
    return {
      ytd: ytdStart >= firstDay ? modifiedDietz(valueOn(series, ytdStart), end, flows, ytdStart, endDay) : null,
      oneYear: oneYearStart >= firstDay ? modifiedDietz(valueOn(series, oneYearStart), end, flows, oneYearStart, endDay) : null,
      annualized: annualized(flows, end, endDay),
    };
  };

  return {
    asOf: endDay,
    since: firstDay,
    points: days.map((day, i) => ({
      day,
      value: Math.round(values[i] * 100) / 100,
      contributed: Math.round(contributedSeries[i] * 100) / 100,
      benchmarks: Object.fromEntries(
        BENCHMARKS.map((b, j) => [b.label, benchSeries[j] ? Math.round(benchSeries[j]![i] * 100) / 100 : null])
      ),
    })),
    returns: {
      portfolio: returnsFor(values),
      benchmarks: Object.fromEntries(
        BENCHMARKS.map((b, j) => [b.label, benchSeries[j] ? returnsFor(benchSeries[j]!) : null])
      ),
    },
    benchmarks: BENCHMARKS.map((b) => ({ ...b })),
    missing,
    fxStale: !fxHistory,
  };
}
