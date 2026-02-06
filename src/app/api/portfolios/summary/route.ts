import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getQuote, getHistoricalPrice, getDividendInfo } from "@/lib/api/yahoo-finance";
import type { QuoteWithRange } from "@/lib/api/yahoo-finance";
import type { PortfolioDashboardData, PortfolioSummary, BreakdownItem } from "@/types";

const CACHE_KEY = "PORTFOLIO_SUMMARY";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  try {
    // Check cache
    const cached = await db.query.stockCache.findFirst({
      where: eq(schema.stockCache.symbol, CACHE_KEY),
    });

    if (cached) {
      const age = Date.now() - cached.fetchedAt.getTime();
      if (age < CACHE_TTL_MS) {
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

    // Fetch exchange rate and quotes in parallel
    const exchangeRatePromise = getQuote("USDCAD=X");
    const quotePromises = uniqueSymbols.map((sym) => getQuote(sym, true));
    const [exchangeRateQuote, ...quoteResults] = await Promise.all([
      exchangeRatePromise,
      ...quotePromises,
    ]);

    const usdCadRate = exchangeRateQuote?.price ?? 1.36;

    // Build quote map
    const quoteMap = new Map<string, QuoteWithRange>();
    uniqueSymbols.forEach((sym, i) => {
      const q = quoteResults[i];
      if (q) quoteMap.set(sym, q as QuoteWithRange);
    });

    // Fetch sector info for breakdown charts (reuse getDividendInfo which returns sector)
    const sectorPromises = uniqueSymbols.map((sym) => getDividendInfo(sym));
    const sectorResults = await Promise.all(sectorPromises);
    const sectorMap = new Map<string, string>();
    uniqueSymbols.forEach((sym, i) => {
      const info = sectorResults[i];
      if (info?.sector) sectorMap.set(sym, info.sector);
    });

    // Helper: convert value to CAD
    const toCAD = (value: number, currency: string): number => {
      return currency === "USD" ? value * usdCadRate : value;
    };

    // Build holding-to-portfolio mapping
    const holdingToPortfolio = new Map<number, number>();
    for (const h of allHoldings) {
      holdingToPortfolio.set(h.id, h.portfolioId);
    }

    // Compute per-portfolio metrics
    let totalMarketValueAll = 0;

    // First pass: compute market values for percentOfTotal
    const portfolioMarketValues = new Map<number, number>();
    for (const holding of activeHoldings) {
      const quote = quoteMap.get(holding.symbol);
      if (!quote) continue;
      const mv = holding.shares * quote.price;
      const mvCAD = toCAD(mv, holding.currency);
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

    // Fetch historical prices for year boundaries
    for (const year of years) {
      const jan1 = new Date(year, 0, 2); // Jan 2 to avoid holiday issues
      const yearPrices = new Map<number, number>();

      const pricePromises = uniqueSymbols.map(async (sym) => {
        const price = await getHistoricalPrice(sym, jan1);
        return { sym, price };
      });

      const prices = await Promise.all(pricePromises);
      for (const { sym, price } of prices) {
        if (price !== null) {
          yearPrices.set(uniqueSymbols.indexOf(sym), price);
          if (!yearStartPrices.has(sym)) yearStartPrices.set(sym, new Map());
          yearStartPrices.get(sym)!.set(year, price);
        }
      }
    }

    // Build portfolio summaries
    const portfolioSummaries: PortfolioSummary[] = [];

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

        marketValue += toCAD(mv, holding.currency);
        costBasis += toCAD(cb, holding.currency);
        todayReturn += toCAD(todayChg, holding.currency);
      }

      const gainLoss = marketValue - costBasis;
      const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
      const todayReturnPercent = marketValue > 0 ? (todayReturn / (marketValue - todayReturn)) * 100 : 0;

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
          const holding = allHoldings.find((h) => h.id === txn.holdingId);
          if (!holding) continue;

          const current = sharesAtStart.get(holding.symbol) ?? { shares: 0, currency: holding.currency };
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

        // End value = current market value for current year, or year-end for completed years
        let endValue = marketValue; // current year

        // Track net flows during the year
        let netBuys = 0;
        let netSells = 0;
        let dividends = 0;
        const yearEnd = new Date(year + 1, 0, 1);

        for (const txn of sortedTxns) {
          const txnDate = new Date(txn.date);
          if (txnDate < jan1 || txnDate >= yearEnd) continue;

          const holding = allHoldings.find((h) => h.id === txn.holdingId);
          if (!holding) continue;

          const value = txn.shares * txn.price;
          if (txn.type === "buy" || txn.type === "transfer_in") {
            netBuys += toCAD(value, holding.currency);
          } else if (txn.type === "sell") {
            netSells += toCAD(value, holding.currency);
          } else if (txn.type === "dividend") {
            dividends += toCAD(value, holding.currency);
          }
        }

        // For completed years, we'd need year-end prices, but for simplicity use current prices
        // This makes the most recent completed year slightly inaccurate but avoids excessive API calls
        const returnAmount = endValue - startValue - netBuys + netSells + dividends;
        const denominator = startValue + netBuys;
        const returnPercent = denominator > 0 ? (returnAmount / denominator) * 100 : 0;

        yearlyReturns[year.toString()] = { amount: returnAmount, percent: returnPercent };
      }

      // Since inception
      let totalInvested = 0;
      let totalDividends = 0;
      for (const txn of pTransactions) {
        const holding = allHoldings.find((h) => h.id === txn.holdingId);
        if (!holding) continue;
        const value = txn.shares * txn.price;
        if (txn.type === "buy" || txn.type === "transfer_in") {
          totalInvested += toCAD(value, holding.currency);
        } else if (txn.type === "sell") {
          totalInvested -= toCAD(value, holding.currency);
        } else if (txn.type === "dividend") {
          totalDividends += toCAD(value, holding.currency);
        }
      }

      const sinceInceptionAmount = marketValue - totalInvested + totalDividends;
      const sinceInceptionPercent = totalInvested > 0 ? (sinceInceptionAmount / totalInvested) * 100 : 0;

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
      });
    }

    // Compute totals
    const totalMarketValue = portfolioSummaries.reduce((s, p) => s + p.marketValue, 0);
    const totalCostBasis = portfolioSummaries.reduce((s, p) => s + p.costBasis, 0);
    const totalGainLoss = totalMarketValue - totalCostBasis;
    const totalGainLossPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;
    const totalTodayReturn = portfolioSummaries.reduce((s, p) => s + p.todayReturn, 0);
    const totalTodayReturnPercent = totalMarketValue > 0
      ? (totalTodayReturn / (totalMarketValue - totalTodayReturn)) * 100
      : 0;

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
      const mv = toCAD(holding.shares * quote.price, holding.currency);
      const type = quote.quoteType === "ETF" ? "ETFs" : "Stocks";
      assetTypeMap.set(type, (assetTypeMap.get(type) ?? 0) + mv);
    }
    // Add cash from cash_transactions
    let totalCash = 0;
    for (const ct of allCashTransactions) {
      const amount = toCAD(ct.amount, ct.currency);
      if (["contribution", "deposit", "refund", "referral", "transfer_in"].includes(ct.type)) {
        totalCash += amount;
      } else if (ct.type === "transfer_out") {
        totalCash -= amount;
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
      const mv = toCAD(holding.shares * quote.price, holding.currency);
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
      const mv = toCAD(holding.shares * quote.price, holding.currency);
      currencyBreakdown.set(holding.currency, (currencyBreakdown.get(holding.currency) ?? 0) + mv);
    }
    const currency: BreakdownItem[] = [...currencyBreakdown.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Top holdings
    const holdingValues: BreakdownItem[] = [];
    for (const holding of activeHoldings) {
      const quote = quoteMap.get(holding.symbol);
      if (!quote) continue;
      const mv = toCAD(holding.shares * quote.price, holding.currency);
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
  } catch (error) {
    console.error("Portfolio summary error:", error);
    return NextResponse.json(
      { error: "Failed to compute portfolio summary" },
      { status: 500 }
    );
  }
}
