"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { PortfolioPerformanceTable } from "@/components/portfolio/portfolio-performance-table";
import { PortfolioDividendTable } from "@/components/portfolio/portfolio-dividend-table";
import { NewsTable } from "@/components/watchlist/news-table";
import { AddTransactionForm } from "@/components/portfolio/add-transaction-form";
import { TransactionsTable } from "@/components/portfolio/transactions-table";
import { DividendReturnsTable } from "@/components/portfolio/dividend-returns-table";
import { CsvImportModal } from "@/components/portfolio/csv-import-modal";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { MainNav, MainNavTabs } from "@/components/layout/main-nav";
import { Portfolio, Holding } from "@/lib/db/schema";
import { PortfolioStats } from "@/components/portfolio/portfolio-stats";
import {
  HoldingWithQuote,
  NewsArticle,
  TransactionWithSymbol,
  PortfolioDashboardData,
  BreakdownItem,
  AlertRuleDTO,
  AlertHistoryEntry,
  TriggeredAlertSummary,
  UnifiedTransaction,
  StockTransactionRow,
  CashTransactionRow,
} from "@/types";
import { formatUpdatedTime, formatCurrency } from "@/lib/utils";
import { AlertsPanel } from "@/components/alerts/alerts-panel";
import {
  triggerHoldingAlerts,
  fetchAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  resetAlertRule,
  fetchAlertHistory,
} from "@/lib/alerts/api";
import type { CreateAlertRuleInput } from "@/lib/alerts/api";

export default function PortfolioPage() {
  const params = useParams();
  const router = useRouter();
  const portfolioId = parseInt(params.id as string);

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [holdings, setHoldings] = useState<HoldingWithQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"holdings" | "performance">("holdings");
  const [dashboardData, setDashboardData] = useState<PortfolioDashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [holdingsView, setHoldingsView] = useState<"holdings" | "performance" | "dividend" | "divreturns" | "news" | "transactions">("holdings");
  const [holdingsUpdatedAt, setHoldingsUpdatedAt] = useState<Date | null>(null);
  const [portfolioNews, setPortfolioNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [transactionsData, setTransactionsData] = useState<TransactionWithSymbol[]>([]);
  const [unifiedTransactions, setUnifiedTransactions] = useState<UnifiedTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [prefillSymbol, setPrefillSymbol] = useState<string | null>(null);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [usdCadRate, setUsdCadRate] = useState<number | null>(null);
  const [holdingAlerts, setHoldingAlerts] = useState<TriggeredAlertSummary[]>([]);
  const [holdingRules, setHoldingRules] = useState<AlertRuleDTO[]>([]);
  const [holdingHistory, setHoldingHistory] = useState<AlertHistoryEntry[]>([]);
  const [alertsPanelOpen, setAlertsPanelOpen] = useState(false);
  const [focusedAlertSymbol, setFocusedAlertSymbol] = useState<string | null>(null);
  const [cashBalance, setCashBalance] = useState<{ cad: number; usd: number; totalDividends: { cad: number; usd: number } }>({ cad: 0, usd: 0, totalDividends: { cad: 0, usd: 0 } });

  // State for MainNavTabs (used for dropdown highlighting)
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<number | null>(null);
  const handleNavTabChange = () => {}; // Navigation handled by MainNavTabs internally

  const refreshHoldingRules = useCallback(async () => {
    const data = await fetchAlertRules("holding");
    setHoldingRules(data);
  }, []);

  const refreshHoldingHistory = useCallback(async () => {
    const data = await fetchAlertHistory("holding", 40);
    setHoldingHistory(data);
  }, []);

  const fetchHoldings = useCallback(async (refresh = false) => {
    setDashboardData(null); // invalidate performance cache
    try {
      const response = await fetch(`/api/holdings?portfolioId=${portfolioId}`);
      const holdingsData: Holding[] = await response.json();

      // Fetch current prices, historical changes, and dividend info for each holding
      const holdingsWithQuotes: HoldingWithQuote[] = await Promise.all(
        holdingsData.map(async (holding) => {
          try {
            const url = refresh
              ? `/api/stocks/${holding.symbol}?changes=true&dividends=true&range=true&refresh=true`
              : `/api/stocks/${holding.symbol}?changes=true&dividends=true&range=true`;
            const quoteResponse = await fetch(url);
            const quoteData = await quoteResponse.json();

            if (quoteData.quote) {
              const currentPrice = quoteData.quote.price;
              const marketValue = holding.shares * currentPrice;
              const costBasis = holding.shares * holding.avgCost;
              const gainLoss = marketValue - costBasis;
              const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

              return {
                ...holding,
                currency: quoteData.quote?.currency || holding.currency,
                shortName: quoteData.quote?.shortName,
                currentPrice,
                marketValue,
                gainLoss,
                gainLossPercent,
                change: quoteData.quote?.change,
                changePercent: quoteData.quote?.changePercent,
                lastTradeTime: quoteData.quote?.lastTradeTime,
                dayHigh: quoteData.quote?.dayHigh,
                dayLow: quoteData.quote?.dayLow,
                fiftyTwoWeekHigh: quoteData.quote?.fiftyTwoWeekHigh,
                fiftyTwoWeekLow: quoteData.quote?.fiftyTwoWeekLow,
                change5D: quoteData.historicalChanges?.change5D,
                change1M: quoteData.historicalChanges?.change1M,
                change3M: quoteData.historicalChanges?.change3M,
                change1Y: quoteData.historicalChanges?.change1Y,
                change5Y: quoteData.historicalChanges?.change5Y,
                dividendRate: quoteData.dividendInfo?.dividendRate,
                dividendYield: quoteData.dividendInfo?.dividendYield,
                exDividendDate: quoteData.dividendInfo?.exDividendDate,
                dividendDate: quoteData.dividendInfo?.dividendDate,
                payoutRatio: quoteData.dividendInfo?.payoutRatio,
                trailingAnnualDividendYield: quoteData.dividendInfo?.trailingAnnualDividendYield,
                fiveYearAvgDividendYield: quoteData.dividendInfo?.fiveYearAvgDividendYield,
                sector: quoteData.dividendInfo?.sector,
                quoteType: quoteData.quote?.quoteType,
                volume: quoteData.quote?.volume,
                avgVolume: quoteData.quote?.avgVolume,
              };
            }
          } catch {
          }

          return holding;
        })
      );

      setHoldings(holdingsWithQuotes);
      setHoldingsUpdatedAt(new Date());
      const triggered = await triggerHoldingAlerts(holdingsWithQuotes);
      setHoldingAlerts(triggered);
      if (triggered.length > 0) {
        refreshHoldingHistory();
      }
    } catch {
    }
  }, [portfolioId, refreshHoldingHistory]);

  const fetchPortfolio = useCallback(async () => {
    try {
      const response = await fetch("/api/portfolios");
      const portfolios: Portfolio[] = await response.json();
      const found = portfolios.find((p) => p.id === portfolioId);
      setPortfolio(found || null);
    } catch {
    }
  }, [portfolioId]);

  const fetchPortfolioNews = useCallback(async () => {
    if (holdings.length === 0) {
      setPortfolioNews([]);
      return;
    }

    setNewsLoading(true);
    try {
      const symbols = holdings.map((h) => h.symbol).join(",");
      const response = await fetch(`/api/news?symbols=${symbols}&limit=20`);
      if (response.ok) {
        const data = await response.json();
        setPortfolioNews(data);
      }
    } catch {
    } finally {
      setNewsLoading(false);
    }
  }, [holdings]);

  const fetchTransactions = useCallback(async () => {
    setTransactionsLoading(true);
    try {
      const [stockRes, cashRes] = await Promise.all([
        fetch(`/api/transactions?portfolioId=${portfolioId}`),
        fetch(`/api/cash-transactions?portfolioId=${portfolioId}`),
      ]);

      const stockData: TransactionWithSymbol[] = stockRes.ok ? await stockRes.json() : [];
      const cashData: CashTransactionRow[] = cashRes.ok
        ? (await cashRes.json()).map((c: Omit<CashTransactionRow, "kind">) => ({ ...c, kind: "cash" as const }))
        : [];

      setTransactionsData(stockData);

      const stockUnified: StockTransactionRow[] = stockData.map((t) => ({ ...t, kind: "stock" as const }));
      const merged: UnifiedTransaction[] = [...stockUnified, ...cashData].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setUnifiedTransactions(merged);
    } catch {
    } finally {
      setTransactionsLoading(false);
    }
  }, [portfolioId]);

  const fetchExchangeRate = useCallback(async () => {
    try {
      const response = await fetch("/api/exchange-rate");
      if (response.ok) {
        const data = await response.json();
        setUsdCadRate(data.rate);
      }
    } catch {
    }
  }, []);

  const fetchCashBalance = useCallback(async () => {
    try {
      const response = await fetch(`/api/cash-transactions/balance?portfolioId=${portfolioId}`);
      if (response.ok) {
        const data = await response.json();
        setCashBalance(data);
      }
    } catch {
    }
  }, [portfolioId]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPortfolio(), fetchHoldings(), fetchExchangeRate(), fetchCashBalance()]);
      setLoading(false);
    };
    loadData();
  }, [fetchPortfolio, fetchHoldings, fetchExchangeRate, fetchCashBalance]);

  useEffect(() => {
    refreshHoldingRules();
    refreshHoldingHistory();
  }, [portfolioId, refreshHoldingRules, refreshHoldingHistory]);

  useEffect(() => {
    if (alertsPanelOpen) {
      refreshHoldingRules();
      refreshHoldingHistory();
    }
  }, [alertsPanelOpen, refreshHoldingRules, refreshHoldingHistory]);

  useEffect(() => {
    if (holdingsView === "news" && holdings.length > 0) {
      fetchPortfolioNews();
    }
  }, [holdingsView, holdings.length, fetchPortfolioNews]);

  useEffect(() => {
    if (holdingsView === "transactions" || holdingsView === "divreturns") {
      fetchTransactions();
    }
  }, [holdingsView, fetchTransactions]);

  useEffect(() => {
    const currentActiveHoldings = holdings.filter(h => h.shares > 0.0001);
    if (activeTab !== "performance" || currentActiveHoldings.length === 0) return;
    if (dashboardData) return; // already fetched

    const buildPerformanceData = async () => {
      setDashboardLoading(true);
      try {
        const res = await fetch("/api/portfolios/summary");
        const summaryData: PortfolioDashboardData = await res.json();
        const portfolioSummary = summaryData.portfolios.find(p => p.id === portfolioId);
        if (!portfolioSummary) {
          setDashboardLoading(false);
          return;
        }

        // Compute CAGR for this portfolio
        const startDate = new Date(portfolioSummary.createdAt);
        const yearsSinceStart = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        const cagr = portfolioSummary.costBasis > 0 && yearsSinceStart > 0
          ? (Math.pow(portfolioSummary.marketValue / portfolioSummary.costBasis, 1 / yearsSinceStart) - 1) * 100
          : 0;

        // Build breakdowns from holdings data
        const assetTypeMap = new Map<string, number>();
        const sectorMap = new Map<string, number>();
        const currencyMap = new Map<string, number>();

        for (const h of currentActiveHoldings) {
          const mv = h.marketValue || 0;
          const type = h.quoteType === "ETF" ? "ETFs" : "Stocks";
          assetTypeMap.set(type, (assetTypeMap.get(type) ?? 0) + mv);
          const sector = h.sector || "Unknown";
          sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + mv);
          currencyMap.set(h.currency, (currencyMap.get(h.currency) ?? 0) + mv);
        }

        // Include cash balance in asset type breakdown
        const cashTotal = cashBalance.cad + cashBalance.usd * (usdCadRate || 1);
        if (cashTotal > 0) {
          assetTypeMap.set("Cash", cashTotal);
        }

        const toSorted = (map: Map<string, number>): BreakdownItem[] =>
          [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

        const topHoldings: BreakdownItem[] = [...currentActiveHoldings]
          .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))
          .map(h => ({ name: h.symbol, value: h.marketValue || 0 }));

        const data: PortfolioDashboardData = {
          portfolios: [portfolioSummary],
          totals: {
            marketValue: portfolioSummary.marketValue,
            costBasis: portfolioSummary.costBasis,
            gainLoss: portfolioSummary.gainLoss,
            gainLossPercent: portfolioSummary.gainLossPercent,
            todayReturn: portfolioSummary.todayReturn,
            todayReturnPercent: portfolioSummary.todayReturnPercent,
            cagr,
            earliestTransactionDate: portfolioSummary.createdAt,
            periodReturns: portfolioSummary.periodReturns,
          },
          breakdowns: {
            assetType: toSorted(assetTypeMap),
            sector: toSorted(sectorMap),
            currency: toSorted(currencyMap),
            topHoldings,
          },
        };

        setDashboardData(data);
      } catch {
      } finally {
        setDashboardLoading(false);
      }
    };

    buildPerformanceData();
  }, [activeTab, holdings, dashboardData, portfolioId]);

  const handleDeleteHolding = async (id: number) => {
    if (!confirm("Are you sure you want to delete this holding and all its transactions?")) return;

    try {
      await fetch(`/api/holdings?id=${id}`, { method: "DELETE" });
      fetchHoldings();
    } catch {
    }
  };

  const handleTransactionAdded = () => {
    fetchHoldings();
    fetchTransactions();
    fetchCashBalance();
    setPrefillSymbol(null);
  };

  const handleAddTransactionForSymbol = (symbol: string) => {
    setPrefillSymbol(symbol);
    setHoldingsView("transactions");
  };

  const handleEditTransaction = async (
    kind: "stock" | "cash",
    id: number,
    data: { shares?: number; price?: number; date?: string; type?: string; amount?: number; description?: string }
  ) => {
    try {
      const endpoint = kind === "cash" ? "/api/cash-transactions" : "/api/transactions";
      await fetch(`${endpoint}?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      fetchTransactions();
      if (kind === "stock") fetchHoldings();
      if (kind === "cash") fetchCashBalance();
    } catch {
    }
  };

  const handleDeleteTransaction = async (kind: "stock" | "cash", id: number) => {
    if (!confirm("Are you sure you want to delete this transaction?")) return;

    try {
      const endpoint = kind === "cash" ? "/api/cash-transactions" : "/api/transactions";
      await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
      fetchTransactions();
      if (kind === "stock") fetchHoldings();
      if (kind === "cash") fetchCashBalance();
    } catch {
    }
  };

  const handleDeleteTransactions = async (items: { kind: "stock" | "cash"; id: number }[]) => {
    if (!confirm(`Delete ${items.length} transaction${items.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;

    try {
      const stockIds = items.filter((i) => i.kind === "stock").map((i) => i.id);
      const cashIds = items.filter((i) => i.kind === "cash").map((i) => i.id);

      const promises: Promise<Response>[] = [];
      if (stockIds.length > 0) {
        promises.push(
          fetch("/api/transactions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: stockIds }),
          })
        );
      }
      if (cashIds.length > 0) {
        promises.push(
          fetch("/api/cash-transactions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: cashIds }),
          })
        );
      }
      await Promise.all(promises);
      fetchTransactions();
      if (stockIds.length > 0) fetchHoldings();
      if (cashIds.length > 0) fetchCashBalance();
    } catch {
    }
  };

  const handleDeleteAllTransactions = async () => {
    const count = unifiedTransactions.length;
    if (!confirm(`Delete ALL ${count} transactions in this portfolio? This cannot be undone.`)) return;

    const typed = prompt(`Type DELETE to confirm removing all ${count} transactions`);
    if (typed !== "DELETE") return;

    try {
      await Promise.all([
        fetch(`/api/transactions?portfolioId=${portfolioId}&all=true`, { method: "DELETE" }),
        fetch(`/api/cash-transactions?portfolioId=${portfolioId}&all=true`, { method: "DELETE" }),
      ]);
      fetchTransactions();
      fetchHoldings();
      fetchCashBalance();
    } catch {
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await fetchHoldings(true);
    setLoading(false);
  };

  const activeHoldings = holdings.filter(h => h.shares > 0.0001);
  const cadHoldings = activeHoldings.filter(h => h.currency === "CAD");
  const usdHoldings = activeHoldings.filter(h => h.currency !== "CAD");

  const cadValue = cadHoldings.reduce((sum, h) => sum + (h.marketValue || 0), 0);
  const cadCost = cadHoldings.reduce((sum, h) => sum + h.shares * h.avgCost, 0);
  const usdValue = usdHoldings.reduce((sum, h) => sum + (h.marketValue || 0), 0);
  const usdCost = usdHoldings.reduce((sum, h) => sum + h.shares * h.avgCost, 0);

  const rate = usdCadRate || 1;
  const hasMixedCurrencies = cadHoldings.length > 0 && usdHoldings.length > 0;

  const holdingsValue = cadValue + usdValue * rate;
  const totalCost = cadCost + usdCost * rate;
  const cashCadTotal = cashBalance.cad + cashBalance.usd * rate;
  const totalValue = holdingsValue + cashCadTotal;
  const dividendsCadTotal = cashBalance.totalDividends.cad + cashBalance.totalDividends.usd * rate;
  const unrealizedGainLoss = holdingsValue - totalCost;
  const totalGainLoss = unrealizedGainLoss + dividendsCadTotal;
  const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
  const unrealizedPercent = totalCost > 0 ? (unrealizedGainLoss / totalCost) * 100 : 0;

  // Today's change
  const todayChangeCAD = cadHoldings.reduce((s, h) => s + (h.change || 0) * h.shares, 0);
  const todayChangeUSD = usdHoldings.reduce((s, h) => s + (h.change || 0) * h.shares, 0);
  const todayChangeCadTotal = todayChangeCAD + todayChangeUSD * rate;
  const todayChangePercent = holdingsValue > 0 ? (todayChangeCadTotal / (holdingsValue - todayChangeCadTotal)) * 100 : 0;

  const handleCreateHoldingRule = async (input: CreateAlertRuleInput) => {
    const rule = await createAlertRule(input);
    setHoldingRules((prev) => [...prev, rule]);
    refreshHoldingHistory();
  };

  const handleUpdateHoldingRule = async (id: number, updates: Partial<CreateAlertRuleInput>) => {
    const updated = await updateAlertRule(id, updates);
    setHoldingRules((prev) => prev.map((rule) => (rule.id === id ? updated : rule)));
  };

  const handleDeleteHoldingRule = async (id: number) => {
    await deleteAlertRule(id);
    setHoldingRules((prev) => prev.filter((rule) => rule.id !== id));
  };

  const handleResetHoldingRule = async (id: number) => {
    await resetAlertRule(id);
    setHoldingRules((prev) =>
      prev.map((rule) => (rule.id === id ? { ...rule, isMuted: false, needsRecovery: false, cooldownUntil: null } : rule))
    );
  };

  const activeHoldingRules = holdingRules.filter((rule) =>
    rule.scope === "holding" && activeHoldings.some((holding) => holding.id === rule.holdingId || holding.symbol === rule.symbol)
  );

  const holdingOptions = activeHoldings.map((holding) => ({
    id: holding.id,
    label: `${holding.shares.toFixed(2)} shares`,
    symbol: holding.symbol,
  }));

  const holdingAlertStates = useMemo(() => {
    const triggeredSymbols = new Set(holdingAlerts.map((alert) => alert.symbol));
    const states: Record<number, { hasRules: boolean; triggered: boolean }> = {};
    activeHoldings.forEach((holding) => {
      const hasRules = holdingRules.some(
        (rule) => rule.scope === "holding" && (rule.holdingId === holding.id || rule.symbol === holding.symbol)
      );
      states[holding.id] = {
        hasRules,
        triggered: triggeredSymbols.has(holding.symbol),
      };
    });
    return states;
  }, [activeHoldings, holdingRules, holdingAlerts]);

  const openHoldingAlerts = (symbol?: string) => {
    setFocusedAlertSymbol(symbol ?? null);
    setAlertsPanelOpen(true);
  };

  if (loading && holdings.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-3 border-blue-500/30 border-t-blue-500 dark:border-blue-500/30 dark:border-t-blue-500 rounded-full animate-spin" />
          <span className="text-black/50 dark:text-white/50">Loading portfolio...</span>
        </div>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-black dark:text-white mb-2">Portfolio Not Found</h3>
          <p className="text-black/50 dark:text-white/50 mb-4">The portfolio you&apos;re looking for doesn&apos;t exist.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium hover:from-blue-600 hover:to-purple-600 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const StatCard = ({ label, value, subValue, colorClass }: { label: string; value: string; subValue?: string; colorClass?: string }) => (
    <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-5">
      <p className="text-sm font-medium text-black/50 dark:text-white/50 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorClass || "text-white"}`}>{value}</p>
      {subValue && <p className={`text-sm mt-1 ${colorClass || "text-black/50 dark:text-white/50"}`}>{subValue}</p>}
    </div>
  );

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <MainNav
        onOpenAlerts={() => openHoldingAlerts()}
        alertCount={holdingAlerts.length}
        hasTriggeredAlerts={holdingAlerts.length > 0}
      />

      {/* Navigation Tabs */}
      <div className="space-y-6">
        <MainNavTabs
          activeTab="portfolios"
          onTabChange={handleNavTabChange}
          selectedWatchlistId={selectedWatchlistId}
          onSelectWatchlist={setSelectedWatchlistId}
          selectedPortfolioId={portfolioId}
          onSelectPortfolio={() => {}}
          selectedScreenId={null}
          onSelectScreen={() => {}}
        />

        {/* Portfolio Title */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              sessionStorage.setItem("navigateToTab", "portfolios");
              router.push("/");
            }}
            className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-black dark:text-white">{portfolio.name}</h1>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-5 mt-8 mb-8">
        {/* Total Value — popover */}
        <Popover>
          <PopoverTrigger asChild>
            <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 cursor-pointer transition-all p-5 relative group">
              <svg className="absolute top-3 right-3 w-3.5 h-3.5 text-black/20 dark:text-white/20 group-hover:text-black/40 dark:group-hover:text-white/40 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-sm font-medium text-black/50 dark:text-white/50 mb-1">Total Value</p>
              <p className="text-2xl font-bold text-black dark:text-white">{formatCurrency(totalValue, "CAD")}</p>
            </div>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Value Breakdown</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                <span className="text-sm text-white/50">Investments (CAD)</span>
                <span className="text-sm font-medium text-white">{formatCurrency(cadValue, "CAD")}</span>
              </div>
              {usdHoldings.length > 0 && (
                <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <span className="text-sm text-white/50">Investments (USD)</span>
                  <div className="text-right">
                    <span className="text-sm font-medium text-white">{formatCurrency(usdValue, "USD")}</span>
                    <p className="text-[11px] text-white/30">{formatCurrency(usdValue * rate, "CAD")}</p>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                <span className="text-sm text-white/50">Cash (CAD)</span>
                <span className="text-sm font-medium text-white">{formatCurrency(cashBalance.cad, "CAD")}</span>
              </div>
              {cashBalance.usd !== 0 && (
                <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <span className="text-sm text-white/50">Cash (USD)</span>
                  <div className="text-right">
                    <span className="text-sm font-medium text-white">{formatCurrency(cashBalance.usd, "USD")}</span>
                    <p className="text-[11px] text-white/30">{formatCurrency(cashBalance.usd * rate, "CAD")}</p>
                  </div>
                </div>
              )}
              {hasMixedCurrencies && (
                <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <span className="text-sm text-white/50">Exchange Rate</span>
                  <span className="text-sm font-medium text-white/70">1 USD = {rate.toFixed(4)} CAD</span>
                </div>
              )}
              <div className="flex justify-between items-center py-1.5">
                <span className="text-sm text-white/50">Today&apos;s Change</span>
                <span className={`text-sm font-medium ${todayChangeCadTotal >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {todayChangeCadTotal >= 0 ? "+" : ""}{formatCurrency(todayChangeCadTotal, "CAD")} ({todayChangePercent >= 0 ? "+" : ""}{todayChangePercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Total Cost — popover */}
        <Popover>
          <PopoverTrigger asChild>
            <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 cursor-pointer transition-all p-5 relative group">
              <svg className="absolute top-3 right-3 w-3.5 h-3.5 text-black/20 dark:text-white/20 group-hover:text-black/40 dark:group-hover:text-white/40 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-sm font-medium text-black/50 dark:text-white/50 mb-1">Total Cost</p>
              <p className="text-2xl font-bold text-black dark:text-white">{formatCurrency(totalCost, "CAD")}</p>
            </div>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Cost Breakdown</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                <span className="text-sm text-white/50">Cost (CAD)</span>
                <span className="text-sm font-medium text-white">{formatCurrency(cadCost, "CAD")}</span>
              </div>
              {usdHoldings.length > 0 && (
                <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <span className="text-sm text-white/50">Cost (USD)</span>
                  <div className="text-right">
                    <span className="text-sm font-medium text-white">{formatCurrency(usdCost, "USD")}</span>
                    <p className="text-[11px] text-white/30">{formatCurrency(usdCost * rate, "CAD")}</p>
                  </div>
                </div>
              )}
              {hasMixedCurrencies && (
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-sm text-white/50">Exchange Rate</span>
                  <span className="text-sm font-medium text-white/70">1 USD = {rate.toFixed(4)} CAD</span>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Total Gain/Loss — popover */}
        <Popover>
          <PopoverTrigger asChild>
            <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 cursor-pointer transition-all p-5 relative group">
              <svg className="absolute top-3 right-3 w-3.5 h-3.5 text-black/20 dark:text-white/20 group-hover:text-black/40 dark:group-hover:text-white/40 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-sm font-medium text-black/50 dark:text-white/50 mb-1">Total Gain/Loss</p>
              <p className={`text-2xl font-bold ${totalGainLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {totalGainLoss >= 0 ? "+" : "-"}{formatCurrency(Math.abs(totalGainLoss), "CAD")}
              </p>
              <p className={`text-sm mt-0.5 ${totalGainLoss >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                {totalGainLossPercent >= 0 ? "+" : ""}{totalGainLossPercent.toFixed(2)}%{dividendsCadTotal > 0 ? ` · incl. ${formatCurrency(dividendsCadTotal, "CAD")} div` : ""}
              </p>
            </div>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Return Breakdown</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                <span className="text-sm text-white/50">Unrealized P&L</span>
                <span className={`text-sm font-medium ${unrealizedGainLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {unrealizedGainLoss >= 0 ? "+" : ""}{formatCurrency(unrealizedGainLoss, "CAD")} ({unrealizedPercent >= 0 ? "+" : ""}{unrealizedPercent.toFixed(2)}%)
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                <span className="text-sm text-white/50">Dividends</span>
                <span className="text-sm font-medium text-emerald-400">+{formatCurrency(dividendsCadTotal, "CAD")}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                <span className="text-sm text-white/50">Total Return</span>
                <span className={`text-sm font-medium ${totalGainLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {totalGainLoss >= 0 ? "+" : ""}{formatCurrency(totalGainLoss, "CAD")} ({totalGainLossPercent >= 0 ? "+" : ""}{totalGainLossPercent.toFixed(2)}%)
                </span>
              </div>
              {hasMixedCurrencies && (
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-sm text-white/50">Exchange Rate</span>
                  <span className="text-sm font-medium text-white/70">1 USD = {rate.toFixed(4)} CAD</span>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <StatCard
          label="Holdings"
          value={activeHoldings.length.toString()}
          subValue={hasMixedCurrencies ? `${usdHoldings.length} USD · ${cadHoldings.length} CAD` : undefined}
        />
        {(() => {
          const hasBothCash = cashBalance.cad !== 0 && cashBalance.usd !== 0;
          const hasCash = cashBalance.cad !== 0 || cashBalance.usd !== 0;
          return (
            <StatCard
              label="Cash Balance"
              value={`C$${cashCadTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              subValue={hasBothCash
                ? `US$${cashBalance.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + C$${cashBalance.cad.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : undefined}
              colorClass={hasCash ? (cashCadTotal >= 0 ? "text-emerald-400" : "text-red-400") : undefined}
            />
          );
        })()}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 w-fit mb-6">
        <button
          onClick={() => setActiveTab("holdings")}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === "holdings"
              ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg"
              : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Holdings
        </button>
        <button
          onClick={() => setActiveTab("performance")}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === "performance"
              ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg"
              : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          Performance
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "holdings" && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-blue-500/10 to-transparent">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="font-semibold text-black dark:text-white">Your Holdings</h2>
                    <p className="text-xs text-black/50 dark:text-white/50">{activeHoldings.length} positions</p>
                  </div>
                </div>
                {/* View tabs */}
                <div className="flex gap-1 p-1 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                  <button
                    onClick={() => setHoldingsView("holdings")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      holdingsView === "holdings"
                        ? "bg-blue-500 text-white"
                        : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    Holdings
                  </button>
                  <button
                    onClick={() => setHoldingsView("performance")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      holdingsView === "performance"
                        ? "bg-blue-500 text-white"
                        : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    Performance
                  </button>
                  <button
                    onClick={() => setHoldingsView("dividend")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      holdingsView === "dividend"
                        ? "bg-blue-500 text-white"
                        : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    Dividend
                  </button>
                  <button
                    onClick={() => setHoldingsView("divreturns")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      holdingsView === "divreturns"
                        ? "bg-blue-500 text-white"
                        : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    Div Returns
                  </button>
                  <button
                    onClick={() => setHoldingsView("news")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      holdingsView === "news"
                        ? "bg-blue-500 text-white"
                        : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    News
                  </button>
                  <button
                    onClick={() => setHoldingsView("transactions")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      holdingsView === "transactions"
                        ? "bg-blue-500 text-white"
                        : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    Transactions
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {holdingsUpdatedAt && (
                  <span className="text-xs text-black/50 dark:text-white/50">
                    {formatUpdatedTime(holdingsUpdatedAt)}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={loading}
                  className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 hover:border-black/20 dark:hover:border-white/20"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-black/30 dark:border-white/30 border-t-black dark:border-t-white rounded-full animate-spin" />
                      Refreshing...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh
                    </div>
                  )}
                </Button>
              </div>
            </div>
            <div className="p-6">
              {holdingAlerts.length > 0 && (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                        {holdingAlerts.length} alert{holdingAlerts.length > 1 ? "s" : ""} triggered
                      </p>
                      <p className="text-xs text-amber-900/70 dark:text-amber-100/70">Holdings crossed your thresholds on the latest refresh.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openHoldingAlerts()}>
                      Review alerts
                    </Button>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm text-amber-900/80 dark:text-amber-100/80">
                    {holdingAlerts.slice(0, 3).map((alert) => (
                      <li key={alert.id}>
                        <span className="font-semibold">{alert.symbol}</span> · {alert.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {holdingsView === "holdings" ? (
                <HoldingsTable
                  holdings={activeHoldings}
                  totalPortfolioValue={totalValue}
                  onDeleteHolding={handleDeleteHolding}
                  onAddTransaction={handleAddTransactionForSymbol}
                  storageKey={`portfolio_${portfolioId}`}
                  alertStates={holdingAlertStates}
                  onOpenAlerts={(symbol) => openHoldingAlerts(symbol)}
                />
              ) : holdingsView === "performance" ? (
                <PortfolioPerformanceTable
                  holdings={activeHoldings}
                  storageKey={`portfolio_${portfolioId}`}
                />
              ) : holdingsView === "dividend" ? (
                <PortfolioDividendTable
                  holdings={activeHoldings}
                  storageKey={`portfolio_${portfolioId}`}
                />
              ) : holdingsView === "divreturns" ? (
                transactionsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                      <span className="text-black/50 dark:text-white/50 text-sm">Loading dividend data...</span>
                    </div>
                  </div>
                ) : (
                  <DividendReturnsTable
                    holdings={activeHoldings}
                    transactions={transactionsData}
                    storageKey={`portfolio_${portfolioId}`}
                  />
                )
              ) : holdingsView === "transactions" ? (
                <div className="space-y-6">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <AddTransactionForm
                        portfolioId={portfolioId}
                        holdings={holdings}
                        onTransactionAdded={handleTransactionAdded}
                        prefillSymbol={prefillSymbol}
                      />
                    </div>
                    <button
                      onClick={() => setShowCsvImport(true)}
                      className="self-start px-4 py-4 rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group flex items-center gap-2"
                      title="Import CSV"
                    >
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-sm font-medium text-black/60 dark:text-white/60 group-hover:text-blue-400 transition-colors whitespace-nowrap">Import CSV</span>
                    </button>
                  </div>
                  {showCsvImport && (
                    <CsvImportModal
                      portfolioId={portfolioId}
                      existingTransactions={transactionsData}
                      onImportComplete={() => {
                        fetchTransactions();
                        fetchHoldings();
                        fetchCashBalance();
                      }}
                      onClose={() => setShowCsvImport(false)}
                    />
                  )}
                  {transactionsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        <span className="text-black/50 dark:text-white/50 text-sm">Loading transactions...</span>
                      </div>
                    </div>
                  ) : (
                    <TransactionsTable
                      transactions={unifiedTransactions}
                      onEditTransaction={handleEditTransaction}
                      onDeleteTransaction={handleDeleteTransaction}
                      onDeleteTransactions={handleDeleteTransactions}
                      onDeleteAllTransactions={handleDeleteAllTransactions}
                    />
                  )}
                </div>
              ) : (
                <NewsTable
                  articles={portfolioNews}
                  loading={newsLoading}
                  emptyMessage="News for your portfolio holdings will appear here."
                />
              )}
            </div>
          </div>

        </div>
      )}

      {activeTab === "performance" && (
        <PortfolioStats data={dashboardData} loading={dashboardLoading} dividendsCadTotal={dividendsCadTotal} showTotalValue={false} showTotalReturn={false} showDividends />
      )}

      <AlertsPanel
        open={alertsPanelOpen}
        scope="holding"
        sourceOptions={holdingOptions}
        rules={activeHoldingRules}
        alerts={holdingAlerts}
        history={holdingHistory}
        focusSymbol={focusedAlertSymbol}
        onClose={() => {
          setAlertsPanelOpen(false);
          setFocusedAlertSymbol(null);
        }}
        onCreateRule={handleCreateHoldingRule}
        onUpdateRule={handleUpdateHoldingRule}
        onDeleteRule={handleDeleteHoldingRule}
        onResetRule={handleResetHoldingRule}
      />
    </div>
  );
}
