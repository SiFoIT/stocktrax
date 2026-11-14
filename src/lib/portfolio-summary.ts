import { db, schema } from "@/lib/db";
import { eq, like } from "drizzle-orm";
import { getQuote, getDailyHistory, getDividendInfo } from "@/lib/api/yahoo-finance";
import type { DailyHistory, QuoteWithRange } from "@/lib/api/yahoo-finance";
import { addDays, digestWeek, MARKET_TIMEZONE, zonedDateStr } from "@/lib/digest/time";
import {
  closeOnOrBeforeDay,
  latestSessionOnOrBefore,
  PERIOD_KEYS,
  periodBaselineDay,
  splitFactorAfter,
  xirr,
  type CashFlow,
} from "@/lib/returns";
import { EXTERNAL_CASH_TYPES } from "@/lib/performance-math";
import { resolveUsdCadRate } from "@/lib/fx";
import type { PortfolioDashboardData, PortfolioSummary, BreakdownItem } from "@/types";
import { CACHE_TTL } from "@/lib/config";

// Versioned: a summary cached in an older shape must not be served to the
// current UI after an upgrade.
const CACHE_KEY = "PORTFOLIO_SUMMARY_V2";

/** A transaction's calendar day. Stored at 12:00 UTC (00:00 UTC for older manual rows). */
const txDay = (date: Date | string | number) => new Date(date).toISOString().slice(0, 10);

/**
 * Drops the cached dashboard so the next read recomputes. Called by every
 * write that changes a figure in it: portfolios, transactions, cash, holding
 * deletes and the imports. A rebuild reads quotes, history and dividends from
 * the shared Yahoo cache, so it costs about one batched quote request.
 */
export async function invalidatePortfolioSummary(): Promise<void> {
  await db.delete(schema.stockCache).where(eq(schema.stockCache.symbol, CACHE_KEY));
  // The value chart replays the same ledger.
  await db.delete(schema.stockCache).where(like(schema.stockCache.symbol, "PERF_V1:%"));
}

/**
 * The portfolio dashboard calculation, extracted from its route handler so the
 * email digest can call it in-process instead of issuing an HTTP request to
 * itself. `GET /api/portfolios/summary` is now a thin wrapper over this.
 *
 * Cache behaviour is unchanged: the computed result is stored in `stock_cache`
 * under a reserved key and reused for `CACHE_TTL.portfolioSummary`.
 */
export async function getPortfolioSummary(): Promise<PortfolioDashboardData> {
  // Check cache
  const cached = await db.query.stockCache.findFirst({
    where: eq(schema.stockCache.symbol, CACHE_KEY),
  });

  if (cached) {
    const age = Date.now() - cached.fetchedAt.getTime();
    if (age < CACHE_TTL.portfolioSummary) {
      return JSON.parse(cached.data) as PortfolioDashboardData;
    }
  }

  // Fetch all data from DB
  const [allPortfolios, allHoldings, allTransactions, allCashTransactions] = await Promise.all([
    db.query.portfolios.findMany(),
    db.query.holdings.findMany(),
    db.query.transactions.findMany(),
    db.query.cashTransactions.findMany(),
  ]);

  if (allPortfolios.length === 0) {
    const empty: PortfolioDashboardData = {
      portfolios: [],
      totals: { marketValue: 0, costBasis: 0, gainLoss: 0, gainLossPercent: 0, todayReturn: 0, todayReturnPercent: 0, sinceInception: null, cagr: null, earliestTransactionDate: new Date().toISOString() },
      breakdowns: { assetType: [], sector: [], currency: [], topHoldings: [] },
    };
    return empty;
  }

  const today = zonedDateStr(new Date(), MARKET_TIMEZONE);
  const sessionDay = latestSessionOnOrBefore(today);
  const currentYear = Number(today.slice(0, 4));
  const years = [currentYear - 1, currentYear];
  const yearEndDay = (year: number) => `${year}-12-31`;

  // History has to reach the earliest baseline used below: the close before
  // last year started. Every 1Y/5D/1M/3M baseline is later than that.
  const historyFrom = addDays(yearEndDay(currentYear - 2), -10);

  // Get unique symbols with shares > 0
  const activeHoldings = allHoldings.filter((h) => h.shares > 0);
  const uniqueSymbols = [...new Set(activeHoldings.map((h) => h.symbol))];

  // Prices are needed at the baselines for every symbol held at any point in
  // the window, including ones sold since: leaving those out drops them from
  // the starting value while their sale proceeds still count, which turns a
  // sale into a gain.
  const holdingById = new Map<number, typeof allHoldings[number]>();
  for (const h of allHoldings) holdingById.set(h.id, h);
  const historySymbols = new Set(uniqueSymbols);
  for (const t of allTransactions) {
    const h = holdingById.get(t.holdingId);
    if (h && txDay(t.date) > historyFrom) historySymbols.add(h.symbol);
  }

  // Fetch exchange rate, quotes, history and sector info all in parallel
  const [exchangeRateQuote, quoteResults, historyResults, sectorResults] = await Promise.all([
    getQuote("USDCAD=X"),
    Promise.all(uniqueSymbols.map((sym) => getQuote(sym, true))),
    Promise.all([...historySymbols].map((sym) => getDailyHistory(sym, historyFrom))),
    Promise.all(uniqueSymbols.map((sym) => getDividendInfo(sym))),
  ]);

  const usdCadRate = await resolveUsdCadRate(exchangeRateQuote?.price);

  // Build quote map
  const quoteMap = new Map<string, QuoteWithRange>();
  uniqueSymbols.forEach((sym, i) => {
    const q = quoteResults[i];
    if (q && Number.isFinite(q.price) && q.price > 0) quoteMap.set(sym, q as QuoteWithRange);
  });
  const missingSymbols = uniqueSymbols.filter((sym) => !quoteMap.has(sym));

  const historyMap = new Map<string, DailyHistory>();
  [...historySymbols].forEach((sym, i) => {
    const h = historyResults[i];
    if (h) historyMap.set(sym, h);
  });

  // Build sector map
  const sectorMap = new Map<string, string>();
  uniqueSymbols.forEach((sym, i) => {
    const info = sectorResults[i];
    if (info?.sector) sectorMap.set(sym, info.sector);
  });

  // Helper: convert value to CAD
  const toCAD = (value: number, currency: string): number => {
    return currency === "USD" ? value * usdCadRate.rate : value;
  };

  // Helper: get canonical currency from quote (falls back to holding record)
  const holdingCurrency = (h: typeof allHoldings[number]): string =>
    (quoteMap.get(h.symbol) as QuoteWithRange | undefined)?.currency || h.currency;

  /** Close of `symbol` on or before `day`, in today's (split-adjusted) share units. */
  const closeOn = (symbol: string, day: string): number | null => {
    const history = historyMap.get(symbol);
    return history ? closeOnOrBeforeDay(history.bars, day) : null;
  };

  // Compute per-portfolio metrics
  let totalMarketValueAll = 0;

  // First pass: compute market values for percentOfTotal
  const portfolioMarketValues = new Map<number, number>();
  for (const holding of activeHoldings) {
    const quote = quoteMap.get(holding.symbol);
    if (!quote) continue;
    const mv = holding.shares * quote.price;
    const mvCAD = toCAD(mv, holdingCurrency(holding));
    const current = portfolioMarketValues.get(holding.portfolioId) ?? 0;
    portfolioMarketValues.set(holding.portfolioId, current + mvCAD);
    totalMarketValueAll += mvCAD;
  }

  // Get all transaction dates to find earliest
  const allTxDates = allTransactions.map((t) => new Date(t.date).getTime());
  const earliestTxDate = allTxDates.length > 0 ? new Date(Math.min(...allTxDates)) : new Date();

  // Build portfolio summaries
  const portfolioSummaries: PortfolioSummary[] = [];

  // Accumulate each portfolio's period-return denominator (startValue + net
  // buys) so the totals row uses a real invested base rather than
  // (totalMarketValue - totalAmt), which ignores mid-period cash flows.
  const periodDenomTotals: Record<string, number> = {};
  let weekDenomTotal = 0;
  const weekBaseline = digestWeek(today).baseline;
  const yearDenomTotals: Record<string, number> = {};
  let totalPeakInvested = 0;
  const allFlows: CashFlow[] = [];

  for (const portfolio of allPortfolios) {
    const pHoldings = activeHoldings.filter((h) => h.portfolioId === portfolio.id);
    const pAllHoldings = allHoldings.filter((h) => h.portfolioId === portfolio.id);
    const holdingIds = new Set(pAllHoldings.map((h) => h.id));
    const pTransactions = allTransactions
      .filter((t) => holdingIds.has(t.holdingId))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id);
    // A holding whose quote failed is missing from market value, so any
    // return measured against it would read as a loss of the whole position.
    const portfolioMissing = pHoldings.some((h) => !quoteMap.has(h.symbol));

    let marketValue = 0;
    let costBasis = 0;
    let todayReturn = 0;

    for (const holding of pHoldings) {
      const quote = quoteMap.get(holding.symbol);
      if (!quote) continue;

      const mv = holding.shares * quote.price;
      const cb = holding.shares * holding.avgCost;

      marketValue += toCAD(mv, holdingCurrency(holding));
      costBasis += toCAD(cb, holdingCurrency(holding));
    }

    // Today's change: shares held at the last close move by the day's change;
    // shares traded this session move from their trade price instead, so a
    // buy at today's price isn't credited with the whole day's move.
    for (const holding of pAllHoldings) {
      const quote = quoteMap.get(holding.symbol);
      const price = quote?.price;
      const prevClose = quote ? quote.price - (quote.change ?? 0) : closeOn(holding.symbol, addDays(sessionDay, -1));
      if (price == null && prevClose == null) continue;
      let sharesAtPrevClose = holding.shares;
      let amount = 0;
      for (const t of pTransactions) {
        if (t.holdingId !== holding.id || txDay(t.date) !== sessionDay) continue;
        if ((t.type === "buy" || t.type === "transfer_in") && t.price > 0) {
          sharesAtPrevClose -= t.shares;
          if (price != null) amount += (price - t.price) * t.shares;
        } else if (t.type === "sell") {
          sharesAtPrevClose += t.shares;
          if (prevClose != null) amount += (t.price - prevClose) * t.shares;
        }
      }
      if (quote && sharesAtPrevClose > 0) amount += (quote.change ?? 0) * sharesAtPrevClose;
      todayReturn += toCAD(amount, holdingCurrency(holding));
    }

    const gainLoss = marketValue - costBasis;
    const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
    const todayReturnBase = marketValue - todayReturn;
    const todayReturnPercent = todayReturnBase > 0 ? (todayReturn / todayReturnBase) * 100 : 0;

    const txValueCAD = (t: (typeof pTransactions)[number]) => {
      const holding = holdingById.get(t.holdingId)!;
      return toCAD(t.shares * t.price, holdingCurrency(holding));
    };

    /** Value at the close of `day`, or null if any position there has no price. */
    const valueAt = (day: string): number | null => {
      const positions = new Map<number, number>();
      for (const t of pTransactions) {
        if (txDay(t.date) > day) break;
        const cur = positions.get(t.holdingId) ?? 0;
        if (t.type === "buy" || t.type === "transfer_in") positions.set(t.holdingId, cur + t.shares);
        else if (t.type === "sell") positions.set(t.holdingId, Math.max(0, cur - t.shares));
      }
      let value = 0;
      for (const [holdingId, shares] of positions) {
        if (shares <= 1e-9) continue;
        const holding = holdingById.get(holdingId)!;
        const close = closeOn(holding.symbol, day);
        if (close == null) return null;
        const units = shares * splitFactorAfter(historyMap.get(holding.symbol)?.splits ?? [], day);
        value += toCAD(units * close, holdingCurrency(holding));
      }
      return value;
    };

    /** Money in and out after the close of `afterDay`, through `throughDay`. */
    const flowsBetween = (afterDay: string, throughDay = "9999-12-31") => {
      let buys = 0;
      let sells = 0;
      let dividends = 0;
      for (const t of pTransactions) {
        const day = txDay(t.date);
        if (day <= afterDay || day > throughDay) continue;
        const value = txValueCAD(t);
        if (t.type === "buy" || t.type === "transfer_in") buys += value;
        else if (t.type === "sell") sells += value;
        else if (t.type === "dividend") dividends += value;
      }
      return { buys, sells, dividends };
    };

    /** Return from the close of `startDay` to `endValue`, net of flows. */
    const returnFrom = (startDay: string, endValue: number, throughDay?: string) => {
      const startValue = valueAt(startDay);
      if (startValue == null) return null;
      const { buys, sells, dividends } = flowsBetween(startDay, throughDay);
      const amount = endValue - startValue - buys + sells + dividends;
      const denominator = startValue + buys;
      return {
        amount,
        percent: denominator > 0 ? (amount / denominator) * 100 : 0,
        denominator,
      };
    };

    // Compute yearly returns: from the last close of the previous year to the
    // last close of this one (or now, for the year in progress).
    const yearlyReturns: Record<string, { amount: number; percent: number }> = {};
    if (!portfolioMissing) {
      for (const year of years) {
        const endValue = year >= currentYear ? marketValue : valueAt(yearEndDay(year));
        if (endValue == null) continue;
        const r = returnFrom(
          yearEndDay(year - 1),
          endValue,
          year >= currentYear ? undefined : yearEndDay(year)
        );
        if (!r) continue;
        yearlyReturns[year.toString()] = { amount: r.amount, percent: r.percent };
        yearDenomTotals[year] = (yearDenomTotals[year] ?? 0) + r.denominator;
      }
    }

    // Since inception: everything that came back (value now, sale proceeds,
    // dividends) less everything put in. The percent is over the most money
    // that was ever in at once, which neither double-counts recycled sale
    // proceeds nor collapses toward zero after a large withdrawal.
    let netInvested = 0;
    let peakInvested = 0;
    let totalDividends = 0;
    const flows: CashFlow[] = [];
    for (const t of pTransactions) {
      const value = txValueCAD(t);
      const day = txDay(t.date);
      if (t.type === "buy" || t.type === "transfer_in") {
        netInvested += value;
        peakInvested = Math.max(peakInvested, netInvested);
        flows.push({ day, amount: -value });
      } else if (t.type === "sell") {
        netInvested -= value;
        flows.push({ day, amount: value });
      } else if (t.type === "dividend") {
        totalDividends += value;
        flows.push({ day, amount: value });
      }
    }
    flows.push({ day: today, amount: marketValue });

    // The annualized return is the account's: when the cash ledger records
    // money coming in from outside, the flows are those deposits (and shares
    // transferred in) and the end value includes cash, matching the
    // performance chart. Without a cash ledger it falls back to trades.
    const pCash = allCashTransactions.filter((c) => c.portfolioId === portfolio.id);
    const external = pCash.filter((c) => EXTERNAL_CASH_TYPES.has(c.type));
    let accountFlows = flows;
    if (external.length > 0) {
      let cashBalance = pCash.reduce((sum, c) => sum + toCAD(c.amount, c.currency), 0);
      accountFlows = external.map((c) => ({ day: txDay(c.date), amount: -toCAD(c.amount, c.currency) }));
      for (const t of pTransactions) {
        const value = txValueCAD(t);
        if (t.type === "buy") cashBalance -= value;
        else if (t.type === "sell" || t.type === "dividend") cashBalance += value;
        else if (t.type === "transfer_in" && value > 0) accountFlows.push({ day: txDay(t.date), amount: -value });
      }
      accountFlows.push({ day: today, amount: marketValue + cashBalance });
    }
    allFlows.push(...accountFlows);
    totalPeakInvested += peakInvested;

    const sinceInceptionAmount = marketValue - netInvested + totalDividends;
    const sinceInceptionPercent = peakInvested > 0 ? (sinceInceptionAmount / peakInvested) * 100 : 0;
    const cagr = portfolioMissing ? null : xirr(accountFlows);

    // Compute period returns (5D, 1M, 3M, 1Y)
    const periodReturns: Record<string, { amount: number; percent: number }> = {};

    // Reuse today's return for "1D"
    periodReturns["1D"] = { amount: todayReturn, percent: todayReturnPercent };

    if (!portfolioMissing) {
      for (const key of PERIOD_KEYS) {
        const r = returnFrom(periodBaselineDay(today, key), marketValue);
        if (!r) continue;
        periodDenomTotals[key] = (periodDenomTotals[key] ?? 0) + r.denominator;
        periodReturns[key] = { amount: r.amount, percent: r.percent };
      }
    }

    let weekReturn: { amount: number; percent: number } | undefined;
    if (!portfolioMissing) {
      const r = returnFrom(weekBaseline, marketValue);
      if (r) {
        weekDenomTotal += r.denominator;
        weekReturn = { amount: r.amount, percent: r.percent };
      }
    }

    // Use earliest transaction date as inception date (more reliable than createdAt which may have been backfilled)
    const earliestPortfolioTx = pTransactions.length > 0
      ? new Date(Math.min(...pTransactions.map((t) => new Date(t.date).getTime())))
      : portfolio.createdAt;

    portfolioSummaries.push({
      id: portfolio.id,
      name: portfolio.name,
      currency: portfolio.currency,
      // A calendar day at 12:00 UTC, like transaction dates, so it reads as the
      // same day in every timezone. An empty portfolio uses its creation day
      // in market time rather than the raw instant.
      createdAt:
        pTransactions.length > 0
          ? (earliestPortfolioTx as Date).toISOString()
          : `${zonedDateStr(new Date(earliestPortfolioTx), MARKET_TIMEZONE)}T12:00:00.000Z`,
      marketValue,
      costBasis,
      gainLoss,
      gainLossPercent,
      todayReturn,
      todayReturnPercent,
      percentOfTotal: totalMarketValueAll > 0 ? (marketValue / totalMarketValueAll) * 100 : 0,
      yearlyReturns,
      sinceInception: portfolioMissing
        ? null
        : { amount: sinceInceptionAmount, percent: sinceInceptionPercent },
      cagr,
      periodReturns,
      ...(weekReturn ? { weekReturn } : {}),
    });
  }

  // Compute totals
  const totalMarketValue = portfolioSummaries.reduce((s, p) => s + p.marketValue, 0);
  const totalCostBasis = portfolioSummaries.reduce((s, p) => s + p.costBasis, 0);
  const totalGainLoss = totalMarketValue - totalCostBasis;
  const totalGainLossPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;
  const totalTodayReturn = portfolioSummaries.reduce((s, p) => s + p.todayReturn, 0);
  const totalTodayReturnBase = totalMarketValue - totalTodayReturn;
  const totalTodayReturnPercent = totalTodayReturnBase > 0
    ? (totalTodayReturn / totalTodayReturnBase) * 100
    : 0;

  // Aggregate period returns across portfolios. A total is shown only when
  // every portfolio has the period; a partial sum would look like a real one.
  const sumAcross = (
    pick: (p: PortfolioSummary) => { amount: number; percent: number } | undefined,
    denom: number | undefined
  ) => {
    const parts = portfolioSummaries.map(pick);
    if (parts.some((r) => !r)) return undefined;
    const amount = parts.reduce((s, r) => s + r!.amount, 0);
    return { amount, percent: denom && denom > 0 ? (amount / denom) * 100 : 0 };
  };

  const totalPeriodReturns: Record<string, { amount: number; percent: number }> = {
    "1D": { amount: totalTodayReturn, percent: totalTodayReturnPercent },
  };
  for (const key of PERIOD_KEYS) {
    const r = sumAcross((p) => p.periodReturns?.[key], periodDenomTotals[key]);
    if (r) totalPeriodReturns[key] = r;
  }
  const totalYearlyReturns: Record<string, { amount: number; percent: number }> = {};
  for (const year of years) {
    const r = sumAcross((p) => p.yearlyReturns[year], yearDenomTotals[year]);
    if (r) totalYearlyReturns[year] = r;
  }

  const totalWeekReturn = sumAcross((p) => p.weekReturn, weekDenomTotal);

  const totalSinceInception = portfolioSummaries.some((p) => !p.sinceInception)
    ? null
    : (() => {
        const amount = portfolioSummaries.reduce((s, p) => s + p.sinceInception!.amount, 0);
        return { amount, percent: totalPeakInvested > 0 ? (amount / totalPeakInvested) * 100 : 0 };
      })();

  // Total dividends across all portfolios (already computed in CAD during per-portfolio loop)
  let allPortfolioDividends = 0;
  for (const txn of allTransactions) {
    if (txn.type !== "dividend") continue;
    const holding = holdingById.get(txn.holdingId);
    if (!holding) continue;
    allPortfolioDividends += toCAD(txn.shares * txn.price, holdingCurrency(holding));
  }

  // Money-weighted annualized return over every portfolio's flows.
  const cagr = missingSymbols.length > 0 ? null : xirr(allFlows);

  // Build breakdowns
  // Asset type breakdown
  const assetTypeMap = new Map<string, number>();
  for (const holding of activeHoldings) {
    const quote = quoteMap.get(holding.symbol);
    if (!quote) continue;
    const mv = toCAD(holding.shares * quote.price, holdingCurrency(holding));
    const type = quote.quoteType === "ETF" ? "ETFs" : "Stocks";
    assetTypeMap.set(type, (assetTypeMap.get(type) ?? 0) + mv);
  }
  // Compute true cash balance (matching /api/cash-transactions/balance logic)
  // Cash transaction amounts are already signed (negative for transfer_out)
  let totalCash = 0;
  for (const ct of allCashTransactions) {
    totalCash += toCAD(ct.amount, ct.currency);
  }
  // Subtract stock buys, add stock sells + dividends
  for (const txn of allTransactions) {
    const holding = holdingById.get(txn.holdingId);
    if (!holding) continue;
    const value = toCAD(txn.shares * txn.price, holdingCurrency(holding));
    if (txn.type === "buy") {
      totalCash -= value;
    } else if (txn.type === "sell") {
      totalCash += value;
    } else if (txn.type === "dividend") {
      totalCash += value;
    }
  }
  if (totalCash > 0) {
    assetTypeMap.set("Cash", totalCash);
  }
  const assetType: BreakdownItem[] = [...assetTypeMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Sector breakdown
  const sectorBreakdown = new Map<string, number>();
  for (const holding of activeHoldings) {
    const quote = quoteMap.get(holding.symbol);
    if (!quote) continue;
    const mv = toCAD(holding.shares * quote.price, holdingCurrency(holding));
    const sector = sectorMap.get(holding.symbol) ?? "Unknown";
    sectorBreakdown.set(sector, (sectorBreakdown.get(sector) ?? 0) + mv);
  }
  const sector: BreakdownItem[] = [...sectorBreakdown.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Currency breakdown
  const currencyBreakdown = new Map<string, number>();
  for (const holding of activeHoldings) {
    const quote = quoteMap.get(holding.symbol);
    if (!quote) continue;
    const mv = toCAD(holding.shares * quote.price, holdingCurrency(holding));
    const cur = holdingCurrency(holding);
    currencyBreakdown.set(cur, (currencyBreakdown.get(cur) ?? 0) + mv);
  }
  const currency: BreakdownItem[] = [...currencyBreakdown.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Top holdings
  const holdingValues: BreakdownItem[] = [];
  for (const holding of activeHoldings) {
    const quote = quoteMap.get(holding.symbol);
    if (!quote) continue;
    const mv = toCAD(holding.shares * quote.price, holdingCurrency(holding));
    // Aggregate by symbol across portfolios
    const existing = holdingValues.find((h) => h.name === holding.symbol);
    if (existing) {
      existing.value += mv;
    } else {
      holdingValues.push({ name: holding.symbol, value: mv });
    }
  }
  const topHoldings = holdingValues
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const result: PortfolioDashboardData = {
    portfolios: portfolioSummaries,
    totals: {
      marketValue: totalMarketValue,
      costBasis: totalCostBasis,
      gainLoss: totalGainLoss,
      gainLossPercent: totalGainLossPercent,
      todayReturn: totalTodayReturn,
      todayReturnPercent: totalTodayReturnPercent,
      sinceInception: totalSinceInception,
      cagr,
      earliestTransactionDate: earliestTxDate.toISOString(),
      totalDividends: allPortfolioDividends,
      totalCash,
      periodReturns: totalPeriodReturns,
      yearlyReturns: totalYearlyReturns,
      ...(totalWeekReturn ? { weekReturn: totalWeekReturn } : {}),
    },
    breakdowns: {
      assetType,
      sector,
      currency,
      topHoldings,
    },
    ...(missingSymbols.length > 0 || usdCadRate.stale
      ? { missing: { symbols: missingSymbols, exchangeRate: usdCadRate.stale } }
      : {}),
  };

  // Cache result. An incomplete result (a quote or the exchange rate failed)
  // is kept for a minute only, so one Yahoo hiccup isn't served for the
  // full TTL.
  const fetchedAt = new Date(
    result.missing ? Date.now() - Math.max(0, CACHE_TTL.portfolioSummary - 60_000) : Date.now()
  );
  await db
    .insert(schema.stockCache)
    .values({
      symbol: CACHE_KEY,
      data: JSON.stringify(result),
      fetchedAt,
    })
    .onConflictDoUpdate({
      target: schema.stockCache.symbol,
      set: {
        data: JSON.stringify(result),
        fetchedAt,
      },
    });

  return result;
}
