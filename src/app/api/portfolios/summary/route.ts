import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getQuote, getHistoricalPrice, getHistoricalPricesMultiDate, getDividendInfo } from "@/lib/api/yahoo-finance";
import type { QuoteWithRange } from "@/lib/api/yahoo-finance";
import type { PortfolioDashboardData, PortfolioSummary, BreakdownItem } from "@/types";
import { CACHE_TTL } from "@/lib/config";

const CACHE_KEY = "PORTFOLIO_SUMMARY";

export async function GET() {
  try {
    // Check cache
    const cached = await db.query.stockCache.findFirst({
      where: eq(schema.stockCache.symbol, CACHE_KEY),
    });

    if (cached) {
      const age = Date.now() - cached.fetchedAt.getTime();
      if (age < CACHE_TTL.portfolioSummary) {
        return NextResponse.json(JSON.parse(cached.data));
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
        totals: { marketValue: 0, costBasis: 0, gainLoss: 0, gainLossPercent: 0, todayReturn: 0, todayReturnPercent: 0, cagr: 0, earliestTransactionDate: new Date().toISOString() },
        breakdowns: { assetType: [], sector: [], currency: [], topHoldings: [] },
      };
      return NextResponse.json(empty);
    }

    // Get unique symbols with shares > 0
    const activeHoldings = allHoldings.filter((h) => h.shares > 0);
    const uniqueSymbols = [...new Set(activeHoldings.map((h) => h.symbol))];

    // Fetch exchange rate, quotes, and sector info all in parallel
    const exchangeRatePromise = getQuote("USDCAD=X");
    const quotePromises = uniqueSymbols.map((sym) => getQuote(sym, true));
    const sectorPromises = uniqueSymbols.map((sym) => getDividendInfo(sym));
    const [exchangeRateQuote, ...quoteAndSectorResults] = await Promise.all([
      exchangeRatePromise,
      ...quotePromises,
      ...sectorPromises,
    ]);

    const quoteResults = quoteAndSectorResults.slice(0, uniqueSymbols.length);
    const sectorResults = quoteAndSectorResults.slice(uniqueSymbols.length);

    const usdCadRate = exchangeRateQuote?.price ?? 1.36;

    // Build quote map
    const quoteMap = new Map<string, QuoteWithRange>();
    uniqueSymbols.forEach((sym, i) => {
      const q = quoteResults[i];
      if (q) quoteMap.set(sym, q as QuoteWithRange);
    });

    // Build sector map
    const sectorMap = new Map<string, string>();
    uniqueSymbols.forEach((sym, i) => {
      const info = sectorResults[i] as Awaited<ReturnType<typeof getDividendInfo>>;
      if (info?.sector) sectorMap.set(sym, info.sector);
    });

    // Helper: convert value to CAD
    const toCAD = (value: number, currency: string): number => {
      return currency === "USD" ? value * usdCadRate : value;
    };

    // Helper: get canonical currency from quote (falls back to holding record)
    const holdingCurrency = (h: typeof allHoldings[number]): string =>
      (quoteMap.get(h.symbol) as QuoteWithRange | undefined)?.currency || h.currency;

    // Build holding lookup maps
    const holdingToPortfolio = new Map<number, number>();
    const holdingById = new Map<number, typeof allHoldings[number]>();
    for (const h of allHoldings) {
      holdingToPortfolio.set(h.id, h.portfolioId);
      holdingById.set(h.id, h);
    }

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

    // Determine years for yearly returns
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear]; // e.g. [2025, 2026]

    // Get all transaction dates to find earliest
    const allTxDates = allTransactions.map((t) => new Date(t.date).getTime());
    const earliestTxDate = allTxDates.length > 0 ? new Date(Math.min(...allTxDates)) : new Date();

    // Compute yearly returns per portfolio
    // For each year, walk transactions to find positions at year start
    const yearStartPrices = new Map<string, Map<number, number>>(); // symbol -> year -> price

    // Fetch historical prices for all year/symbol combinations in parallel
    const allPricePromises = years.flatMap((year) => {
      const jan1 = new Date(year, 0, 2); // Jan 2 to avoid holiday issues
      return uniqueSymbols.map(async (sym) => {
        const price = await getHistoricalPrice(sym, jan1);
        return { sym, year, price };
      });
    });

    const allPriceResults = await Promise.all(allPricePromises);
    for (const { sym, year, price } of allPriceResults) {
      if (price !== null) {
        if (!yearStartPrices.has(sym)) yearStartPrices.set(sym, new Map());
        yearStartPrices.get(sym)!.set(year, price);
      }
    }

    // Fetch historical prices for period returns (5D, 1M, 3M, 1Y)
    const now = new Date();
    const periodDefs = [
      { key: "5D", days: 5 },
      { key: "1M", days: 30 },
      { key: "3M", days: 90 },
      { key: "1Y", days: 365 },
    ];
    const periodTargetDates = periodDefs.map(({ days }) => {
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      return d;
    });

    // One chart call per symbol, extracting all 4 dates
    const periodPricePromises = uniqueSymbols.map(async (sym) => {
      const prices = await getHistoricalPricesMultiDate(sym, periodTargetDates);
      return { sym, prices };
    });
    const periodPriceResults = await Promise.all(periodPricePromises);

    // symbol -> Map<targetDateTimestamp, price>
    const periodPricesMap = new Map<string, Map<number, number>>();
    for (const { sym, prices } of periodPriceResults) {
      periodPricesMap.set(sym, prices);
    }

    // Build portfolio summaries
    const portfolioSummaries: PortfolioSummary[] = [];

    // Accumulate each portfolio's period-return denominator (startValue + net
    // buys) so the totals row uses a real invested base rather than
    // (totalMarketValue - totalAmt), which ignores mid-period cash flows.
    const periodDenomTotals: Record<string, number> = {};

    for (const portfolio of allPortfolios) {
      const pHoldings = activeHoldings.filter((h) => h.portfolioId === portfolio.id);
      const pAllHoldings = allHoldings.filter((h) => h.portfolioId === portfolio.id);
      const holdingIds = new Set(pAllHoldings.map((h) => h.id));
      const pTransactions = allTransactions.filter((t) => holdingIds.has(t.holdingId));

      let marketValue = 0;
      let costBasis = 0;
      let todayReturn = 0;

      for (const holding of pHoldings) {
        const quote = quoteMap.get(holding.symbol);
        if (!quote) continue;

        const mv = holding.shares * quote.price;
        const cb = holding.shares * holding.avgCost;
        const todayChg = (quote.change ?? 0) * holding.shares;

        marketValue += toCAD(mv, holdingCurrency(holding));
        costBasis += toCAD(cb, holdingCurrency(holding));
        todayReturn += toCAD(todayChg, holdingCurrency(holding));
      }

      const gainLoss = marketValue - costBasis;
      const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
      const todayReturnBase = marketValue - todayReturn;
      const todayReturnPercent = todayReturnBase > 0 ? (todayReturn / todayReturnBase) * 100 : 0;

      // Compute yearly returns
      const yearlyReturns: Record<string, { amount: number; percent: number }> = {};

      for (const year of years) {
        // Walk transactions to find shares held per symbol at Jan 1 of this year
        const jan1 = new Date(year, 0, 1);
        const sharesAtStart = new Map<string, { shares: number; currency: string }>();

        // Only consider transactions for this portfolio's holdings
        const sortedTxns = [...pTransactions].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        for (const txn of sortedTxns) {
          if (new Date(txn.date) >= jan1) break;
          const holding = holdingById.get(txn.holdingId);
          if (!holding) continue;

          const current = sharesAtStart.get(holding.symbol) ?? { shares: 0, currency: holdingCurrency(holding) };
          if (txn.type === "buy" || txn.type === "transfer_in") {
            current.shares += txn.shares;
          } else if (txn.type === "sell") {
            current.shares -= txn.shares;
          }
          sharesAtStart.set(holding.symbol, current);
        }

        // Compute start value
        let startValue = 0;
        for (const [sym, { shares, currency }] of sharesAtStart) {
          if (shares <= 0) continue;
          const price = yearStartPrices.get(sym)?.get(year);
          if (price) {
            startValue += toCAD(shares * price, currency);
          }
        }

        const yearEnd = new Date(year + 1, 0, 1);

        // End value: for the in-progress year use current market value; for a
        // completed year, price the shares held at year-end using the year-end
        // close (~Jan 2 of the following year, already fetched into
        // yearStartPrices for `year + 1`). Using current market value here would
        // let the completed year absorb all of the following period's movement.
        let endValue: number;
        if (year >= currentYear) {
          endValue = marketValue;
        } else {
          const sharesAtEnd = new Map<string, { shares: number; currency: string }>();
          for (const txn of sortedTxns) {
            if (new Date(txn.date) >= yearEnd) break;
            const holding = holdingById.get(txn.holdingId);
            if (!holding) continue;
            const cur = sharesAtEnd.get(holding.symbol) ?? { shares: 0, currency: holdingCurrency(holding) };
            if (txn.type === "buy" || txn.type === "transfer_in") {
              cur.shares += txn.shares;
            } else if (txn.type === "sell") {
              cur.shares -= txn.shares;
            }
            sharesAtEnd.set(holding.symbol, cur);
          }
          endValue = 0;
          for (const [sym, { shares, currency }] of sharesAtEnd) {
            if (shares <= 0) continue;
            const price = yearStartPrices.get(sym)?.get(year + 1);
            if (price) {
              endValue += toCAD(shares * price, currency);
            }
          }
        }

        // Track net flows during the year
        let netBuys = 0;
        let netSells = 0;
        let dividends = 0;

        for (const txn of sortedTxns) {
          const txnDate = new Date(txn.date);
          if (txnDate < jan1 || txnDate >= yearEnd) continue;

          const holding = holdingById.get(txn.holdingId);
          if (!holding) continue;

          const value = txn.shares * txn.price;
          if (txn.type === "buy" || txn.type === "transfer_in") {
            netBuys += toCAD(value, holdingCurrency(holding));
          } else if (txn.type === "sell") {
            netSells += toCAD(value, holdingCurrency(holding));
          } else if (txn.type === "dividend") {
            dividends += toCAD(value, holdingCurrency(holding));
          }
        }

        const returnAmount = endValue - startValue - netBuys + netSells + dividends;
        const denominator = startValue + netBuys;
        const returnPercent = denominator > 0 ? (returnAmount / denominator) * 100 : 0;

        yearlyReturns[year.toString()] = { amount: returnAmount, percent: returnPercent };
      }

      // Since inception
      let totalInvested = 0;
      let totalDividends = 0;
      for (const txn of pTransactions) {
        const holding = holdingById.get(txn.holdingId);
        if (!holding) continue;
        const value = txn.shares * txn.price;
        if (txn.type === "buy" || txn.type === "transfer_in") {
          totalInvested += toCAD(value, holdingCurrency(holding));
        } else if (txn.type === "sell") {
          totalInvested -= toCAD(value, holdingCurrency(holding));
        } else if (txn.type === "dividend") {
          totalDividends += toCAD(value, holdingCurrency(holding));
        }
      }

      const sinceInceptionAmount = marketValue - totalInvested + totalDividends;
      const sinceInceptionPercent = totalInvested > 0 ? (sinceInceptionAmount / totalInvested) * 100 : 0;

      // Compute period returns (5D, 1M, 3M, 1Y)
      const periodReturns: Record<string, { amount: number; percent: number }> = {};

      // Reuse today's return for "1D"
      periodReturns["1D"] = { amount: todayReturn, percent: todayReturnPercent };

      const sortedTxnsForPeriod = [...pTransactions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      for (let pi = 0; pi < periodDefs.length; pi++) {
        const { key } = periodDefs[pi];
        const periodStart = periodTargetDates[pi];
        const periodStartTs = periodStart.getTime();

        // Walk transactions to find shares held at period start
        const sharesAtPeriodStart = new Map<string, { shares: number; currency: string }>();

        for (const txn of sortedTxnsForPeriod) {
          if (new Date(txn.date) >= periodStart) break;
          const h = holdingById.get(txn.holdingId);
          if (!h) continue;
          const cur = sharesAtPeriodStart.get(h.symbol) ?? { shares: 0, currency: holdingCurrency(h) };
          if (txn.type === "buy" || txn.type === "transfer_in") {
            cur.shares += txn.shares;
          } else if (txn.type === "sell") {
            cur.shares -= txn.shares;
          }
          sharesAtPeriodStart.set(h.symbol, cur);
        }

        // Compute start value using historical prices
        let startVal = 0;
        for (const [sym, { shares, currency }] of sharesAtPeriodStart) {
          if (shares <= 0) continue;
          const price = periodPricesMap.get(sym)?.get(periodStartTs);
          if (price) {
            startVal += toCAD(shares * price, currency);
          }
        }

        // Track flows during the period
        let pNetBuys = 0;
        let pNetSells = 0;
        let pDividends = 0;

        for (const txn of sortedTxnsForPeriod) {
          const txnDate = new Date(txn.date);
          if (txnDate < periodStart) continue;
          const h = holdingById.get(txn.holdingId);
          if (!h) continue;
          const value = txn.shares * txn.price;
          if (txn.type === "buy" || txn.type === "transfer_in") {
            pNetBuys += toCAD(value, holdingCurrency(h));
          } else if (txn.type === "sell") {
            pNetSells += toCAD(value, holdingCurrency(h));
          } else if (txn.type === "dividend") {
            pDividends += toCAD(value, holdingCurrency(h));
          }
        }

        const returnAmt = marketValue - startVal - pNetBuys + pNetSells + pDividends;
        const denom = startVal + pNetBuys;
        const returnPct = denom > 0 ? (returnAmt / denom) * 100 : 0;

        periodDenomTotals[key] = (periodDenomTotals[key] ?? 0) + denom;
        periodReturns[key] = { amount: returnAmt, percent: returnPct };
      }

      // Use earliest transaction date as inception date (more reliable than createdAt which may have been backfilled)
      const earliestPortfolioTx = pTransactions.length > 0
        ? new Date(Math.min(...pTransactions.map((t) => new Date(t.date).getTime())))
        : portfolio.createdAt;

      portfolioSummaries.push({
        id: portfolio.id,
        name: portfolio.name,
        currency: portfolio.currency,
        createdAt: earliestPortfolioTx instanceof Date ? earliestPortfolioTx.toISOString() : new Date(earliestPortfolioTx).toISOString(),
        marketValue,
        costBasis,
        gainLoss,
        gainLossPercent,
        todayReturn,
        todayReturnPercent,
        percentOfTotal: totalMarketValueAll > 0 ? (marketValue / totalMarketValueAll) * 100 : 0,
        yearlyReturns,
        sinceInception: { amount: sinceInceptionAmount, percent: sinceInceptionPercent },
        periodReturns,
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

    // Aggregate period returns across portfolios
    const totalPeriodReturns: Record<string, { amount: number; percent: number }> = {};
    const periodKeys = ["1D", "5D", "1M", "3M", "1Y"];
    for (const key of periodKeys) {
      let totalAmt = 0;
      let totalDenom = 0;
      for (const p of portfolioSummaries) {
        const pr = p.periodReturns?.[key];
        if (pr) {
          totalAmt += pr.amount;
        }
      }
      // Percent uses the summed per-portfolio denominators (startValue + net
      // buys), consistent with each portfolio's own period-return percent.
      if (key === "1D") {
        totalPeriodReturns[key] = { amount: totalTodayReturn, percent: totalTodayReturnPercent };
      } else {
        totalDenom = periodDenomTotals[key] ?? 0;
        const pct = totalDenom > 0 ? (totalAmt / totalDenom) * 100 : 0;
        totalPeriodReturns[key] = { amount: totalAmt, percent: pct };
      }
    }

    // Total dividends across all portfolios (already computed in CAD during per-portfolio loop)
    let allPortfolioDividends = 0;
    for (const txn of allTransactions) {
      if (txn.type !== "dividend") continue;
      const holding = holdingById.get(txn.holdingId);
      if (!holding) continue;
      allPortfolioDividends += toCAD(txn.shares * txn.price, holdingCurrency(holding));
    }

    // CAGR
    const daysSinceStart = (Date.now() - earliestTxDate.getTime()) / (1000 * 60 * 60 * 24);
    const yearsSinceStart = daysSinceStart / 365.25;
    const totalInvestedAll = portfolioSummaries.reduce((s, p) => s + p.costBasis, 0);
    const cagr = totalInvestedAll > 0 && yearsSinceStart > 0
      ? (Math.pow(totalMarketValue / totalInvestedAll, 1 / yearsSinceStart) - 1) * 100
      : 0;

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
        cagr,
        earliestTransactionDate: earliestTxDate.toISOString(),
        totalDividends: allPortfolioDividends,
        totalCash,
        periodReturns: totalPeriodReturns,
      },
      breakdowns: {
        assetType,
        sector,
        currency,
        topHoldings,
      },
    };

    // Cache result
    await db
      .insert(schema.stockCache)
      .values({
        symbol: CACHE_KEY,
        data: JSON.stringify(result),
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.stockCache.symbol,
        set: {
          data: JSON.stringify(result),
          fetchedAt: new Date(),
        },
      });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to compute portfolio summary" },
      { status: 500 }
    );
  }
}
