"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { PortfolioPerformanceTable } from "@/components/portfolio/portfolio-performance-table";
import { PortfolioDividendTable } from "@/components/portfolio/portfolio-dividend-table";
import { PortfolioInsiderTable } from "@/components/portfolio/portfolio-insider-table";
import { NewsTable } from "@/components/watchlist/news-table";
import { AddTransactionForm } from "@/components/portfolio/add-transaction-form";
import { TransactionsTable } from "@/components/portfolio/transactions-table";
import { DividendReturnsTable } from "@/components/portfolio/dividend-returns-table";
import { CsvImportModal } from "@/components/portfolio/csv-import-modal";
import { ArrowLeft, Info, Loader2, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, type PanelTab } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { AppHeader } from "@/components/layout/app-header";
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
import { formatCurrency } from "@/lib/utils";
import { useRelativeTime } from "@/lib/hooks/use-relative-time";
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

type HoldingsView =
  | "overview"
  | "holdings"
  | "performance"
  | "dividend"
  | "insider"
  | "divreturns"
  | "news"
  | "transactions";

const HOLDINGS_VIEWS: readonly PanelTab<HoldingsView>[] = [
  { key: "overview", label: "Overview" },
  { key: "holdings", label: "Holdings" },
  { key: "performance", label: "Performance" },
  { key: "dividend", label: "Dividend" },
  { key: "insider", label: "Insider" },
  { key: "divreturns", label: "Div returns" },
  { key: "news", label: "News" },
  { key: "transactions", label: "Transactions" },
];

export default function PortfolioPage() {
  const params = useParams();
  const router = useRouter();
  const portfolioId = parseInt(params.id as string);

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [holdings, setHoldings] = useState<HoldingWithQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<PortfolioDashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [holdingsView, setHoldingsView] = useState<HoldingsView>("holdings");
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
  const holdingsUpdatedLabel = useRelativeTime(holdingsUpdatedAt);

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
              ? `/api/stocks/${holding.symbol}?changes=true&dividends=true&insider=true&range=true&refresh=true`
              : `/api/stocks/${holding.symbol}?changes=true&dividends=true&insider=true&range=true`;
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
                extendedHours: quoteData.quote?.extendedHours,
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
                insidersPercentHeld: quoteData.insiderInfo?.insidersPercentHeld,
                netBuyCount6mo: quoteData.insiderInfo?.netBuyCount6mo,
                netSellCount6mo: quoteData.insiderInfo?.netSellCount6mo,
                netInsiderShares6mo: quoteData.insiderInfo?.netInsiderShares6mo,
                lastInsiderName: quoteData.insiderInfo?.lastInsiderName,
                lastInsiderType: quoteData.insiderInfo?.lastInsiderType,
                lastInsiderDate: quoteData.insiderInfo?.lastInsiderDate,
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
        // Converts the USD half of the cached Cash slice; same invalidation applies.
        setDashboardData(null);
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
        // The overview breakdown caches a Cash slice built from this balance, and
        // only fetchHoldings cleared that cache. Editing or deleting a cash-only
        // transaction refreshes the balance without touching holdings, so the
        // cache has to be invalidated here too.
        setDashboardData(null);
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
    if (holdingsView !== "overview" || currentActiveHoldings.length === 0) return;
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
  }, [holdingsView, holdings, dashboardData, portfolioId, cashBalance.cad, cashBalance.usd, usdCadRate]);

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
  const todayChangeBase = holdingsValue - todayChangeCadTotal;
  const todayChangePercent = todayChangeBase > 0 ? (todayChangeCadTotal / todayChangeBase) * 100 : 0;

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
      const hasRecoveryOrMuted = holdingRules.some(
        (rule) => rule.scope === "holding" && (rule.holdingId === holding.id || rule.symbol === holding.symbol) && (rule.needsRecovery || rule.isMuted)
      );
      states[holding.id] = {
        hasRules,
        triggered: triggeredSymbols.has(holding.symbol) || hasRecoveryOrMuted,
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
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading portfolio…
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Portfolio not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The portfolio you&apos;re looking for doesn&apos;t exist.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/">
              <ArrowLeft className="size-3.5" />
              Back to dashboard
            </Link>
          </Button>
        </div>
      </div>
    );
  }


  return (
    <>
      <AppHeader
        activeTab="portfolios"
        onTabChange={handleNavTabChange}
        selectedWatchlistId={selectedWatchlistId}
        onSelectWatchlist={setSelectedWatchlistId}
        selectedPortfolioId={portfolioId}
        onSelectPortfolio={() => {}}
        selectedScreenId={null}
        onSelectScreen={() => {}}
        onOpenAlerts={() => openHoldingAlerts()}
        alertCount={holdingAlerts.length}
        hasTriggeredAlerts={holdingAlerts.length > 0}
      />

      <div className="mx-auto max-w-[1536px] px-6 py-5">

        {/* Portfolio title */}
        <div className="mb-4 flex items-center gap-2.5">
          <button
            onClick={() => {
              sessionStorage.setItem("navigateToTab", "portfolios");
              router.push("/");
            }}
            aria-label="Back to portfolios"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </button>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{portfolio.name}</h1>
          {/* Only the currency: portfolios.created_at is backfilled for some rows, so the
              summary endpoint uses earliest-transaction date as inception instead. */}
          <span className="text-xs text-subtle-foreground">{portfolio.currency}</span>
        </div>

      {/* Stats Grid */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-5">
        {/* Total Value — popover */}
        <Popover>
          <PopoverTrigger asChild>
            <div className="group relative min-w-0 cursor-pointer rounded-lg border border-border bg-card px-3.5 py-3 transition-colors hover:border-border-strong">
              <Info className="absolute right-3 top-3 size-3 text-subtle-foreground/70 transition-colors group-hover:text-muted-foreground" />
              <p className="mb-1 text-xs text-muted-foreground">Total Value</p>
              <p className="break-words text-lg font-semibold tracking-tight sm:text-xl text-foreground">{formatCurrency(totalValue, "CAD")}</p>
            </div>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Value Breakdown</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1.5 border-b border-border">
                <span className="text-sm text-muted-foreground">Investments (CAD)</span>
                <span className="text-sm font-medium text-foreground">{formatCurrency(cadValue, "CAD")}</span>
              </div>
              {usdHoldings.length > 0 && (
                <div className="flex justify-between items-center py-1.5 border-b border-border">
                  <span className="text-sm text-muted-foreground">Investments (USD)</span>
                  <div className="text-right">
                    <span className="text-sm font-medium text-foreground">{formatCurrency(usdValue, "USD")}</span>
                    <p className="text-[11px] text-subtle-foreground">{formatCurrency(usdValue * rate, "CAD")}</p>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center py-1.5 border-b border-border">
                <span className="text-sm text-muted-foreground">Cash (CAD)</span>
                <span className="text-sm font-medium text-foreground">{formatCurrency(cashBalance.cad, "CAD")}</span>
              </div>
              {cashBalance.usd !== 0 && (
                <div className="flex justify-between items-center py-1.5 border-b border-border">
                  <span className="text-sm text-muted-foreground">Cash (USD)</span>
                  <div className="text-right">
                    <span className="text-sm font-medium text-foreground">{formatCurrency(cashBalance.usd, "USD")}</span>
                    <p className="text-[11px] text-subtle-foreground">{formatCurrency(cashBalance.usd * rate, "CAD")}</p>
                  </div>
                </div>
              )}
              {hasMixedCurrencies && (
                <div className="flex justify-between items-center py-1.5 border-b border-border">
                  <span className="text-sm text-muted-foreground">Exchange Rate</span>
                  <span className="text-sm font-medium text-muted-foreground">1 USD = {rate.toFixed(4)} CAD</span>
                </div>
              )}
              <div className="flex justify-between items-center py-1.5">
                <span className="text-sm text-muted-foreground">Today&apos;s Change</span>
                <span className={`text-sm font-medium ${todayChangeCadTotal >= 0 ? "text-positive" : "text-negative"}`}>
                  {todayChangeCadTotal >= 0 ? "+" : ""}{formatCurrency(todayChangeCadTotal, "CAD")} ({todayChangePercent >= 0 ? "+" : ""}{todayChangePercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Total Cost — popover */}
        <Popover>
          <PopoverTrigger asChild>
            <div className="group relative min-w-0 cursor-pointer rounded-lg border border-border bg-card px-3.5 py-3 transition-colors hover:border-border-strong">
              <Info className="absolute right-3 top-3 size-3 text-subtle-foreground/70 transition-colors group-hover:text-muted-foreground" />
              <p className="mb-1 text-xs text-muted-foreground">Total Cost</p>
              <p className="break-words text-lg font-semibold tracking-tight sm:text-xl text-foreground">{formatCurrency(totalCost, "CAD")}</p>
            </div>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Cost Breakdown</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1.5 border-b border-border">
                <span className="text-sm text-muted-foreground">Cost (CAD)</span>
                <span className="text-sm font-medium text-foreground">{formatCurrency(cadCost, "CAD")}</span>
              </div>
              {usdHoldings.length > 0 && (
                <div className="flex justify-between items-center py-1.5 border-b border-border">
                  <span className="text-sm text-muted-foreground">Cost (USD)</span>
                  <div className="text-right">
                    <span className="text-sm font-medium text-foreground">{formatCurrency(usdCost, "USD")}</span>
                    <p className="text-[11px] text-subtle-foreground">{formatCurrency(usdCost * rate, "CAD")}</p>
                  </div>
                </div>
              )}
              {hasMixedCurrencies && (
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-sm text-muted-foreground">Exchange Rate</span>
                  <span className="text-sm font-medium text-muted-foreground">1 USD = {rate.toFixed(4)} CAD</span>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Total Gain/Loss — popover */}
        <Popover>
          <PopoverTrigger asChild>
            <div className="group relative min-w-0 cursor-pointer rounded-lg border border-border bg-card px-3.5 py-3 transition-colors hover:border-border-strong">
              <Info className="absolute right-3 top-3 size-3 text-subtle-foreground/70 transition-colors group-hover:text-muted-foreground" />
              <p className="mb-1 text-xs text-muted-foreground">Total Gain/Loss</p>
              <p className={`break-words text-lg font-semibold tracking-tight sm:text-xl ${totalGainLoss >= 0 ? "text-positive" : "text-negative"}`}>
                {totalGainLoss >= 0 ? "+" : "-"}{formatCurrency(Math.abs(totalGainLoss), "CAD")}
              </p>
              <p className={`mt-0.5 text-xs ${totalGainLoss >= 0 ? "text-positive" : "text-negative"}`}>
                {totalGainLossPercent >= 0 ? "+" : ""}{totalGainLossPercent.toFixed(2)}%{dividendsCadTotal > 0 ? ` · incl. ${formatCurrency(dividendsCadTotal, "CAD")} div` : ""}
              </p>
            </div>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Return Breakdown</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1.5 border-b border-border">
                <span className="text-sm text-muted-foreground">Unrealized P&L</span>
                <span className={`text-sm font-medium ${unrealizedGainLoss >= 0 ? "text-positive" : "text-negative"}`}>
                  {unrealizedGainLoss >= 0 ? "+" : ""}{formatCurrency(unrealizedGainLoss, "CAD")} ({unrealizedPercent >= 0 ? "+" : ""}{unrealizedPercent.toFixed(2)}%)
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-border">
                <span className="text-sm text-muted-foreground">Dividends</span>
                <span className="text-sm font-medium text-positive">+{formatCurrency(dividendsCadTotal, "CAD")}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-border">
                <span className="text-sm text-muted-foreground">Total Return</span>
                <span className={`text-sm font-medium ${totalGainLoss >= 0 ? "text-positive" : "text-negative"}`}>
                  {totalGainLoss >= 0 ? "+" : ""}{formatCurrency(totalGainLoss, "CAD")} ({totalGainLossPercent >= 0 ? "+" : ""}{totalGainLossPercent.toFixed(2)}%)
                </span>
              </div>
              {hasMixedCurrencies && (
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-sm text-muted-foreground">Exchange Rate</span>
                  <span className="text-sm font-medium text-muted-foreground">1 USD = {rate.toFixed(4)} CAD</span>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <StatCard
          label="Holdings"
          value={activeHoldings.length.toString()}
          sub={hasMixedCurrencies ? `${usdHoldings.length} USD · ${cadHoldings.length} CAD` : undefined}
        />
        {(() => {
          const hasBothCash = cashBalance.cad !== 0 && cashBalance.usd !== 0;
          const hasCash = cashBalance.cad !== 0 || cashBalance.usd !== 0;
          return (
            <StatCard
              label="Cash Balance"
              value={`C$${cashCadTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              sub={hasBothCash
                ? `US$${cashBalance.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + C$${cashBalance.cad.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : undefined}
              valueClass={hasCash ? (cashCadTotal >= 0 ? "text-positive" : "text-negative") : undefined}
            />
          );
        })()}
      </div>

      <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Holdings"
              meta={`${activeHoldings.length} positions`}
              tabs={HOLDINGS_VIEWS}
              activeTab={holdingsView}
              onTabChange={setHoldingsView}
              right={
                <>
                  {holdingsUpdatedLabel && <span>{holdingsUpdatedLabel}</span>}
                  <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Refreshing
                      </>
                    ) : (
                      <>
                        <RefreshCw className="size-3.5" />
                        Refresh
                      </>
                    )}
                  </Button>
                </>
              }
            />
            <PanelBody>
              {holdingAlerts.length > 0 && (
                <div className="m-4 rounded-md border border-warning/30 bg-warning/10 p-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {holdingAlerts.length} alert{holdingAlerts.length > 1 ? "s" : ""} triggered
                      </p>
                      <p className="text-xs text-muted-foreground">Holdings crossed your thresholds on the latest refresh.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openHoldingAlerts()}>
                      Review alerts
                    </Button>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {holdingAlerts.slice(0, 3).map((alert) => (
                      <li key={alert.id}>
                        <span className="font-semibold">{alert.symbol}</span> · {alert.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {holdingsView === "overview" ? (
                <div className="p-4">
                  <PortfolioStats
                    data={dashboardData}
                    loading={dashboardLoading}
                    dividendsCadTotal={dividendsCadTotal}
                    showTotalValue={false}
                    showTotalReturn={false}
                    showDividends
                  />
                </div>
              ) : holdingsView === "holdings" ? (
                <HoldingsTable
                  key={`portfolio_${portfolioId}`}
                  holdings={activeHoldings}
                  totalPortfolioValue={holdingsValue}
                  usdCadRate={rate}
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
                  usdCadRate={rate}
                  storageKey={`portfolio_${portfolioId}`}
                />
              ) : holdingsView === "insider" ? (
                <PortfolioInsiderTable
                  holdings={activeHoldings}
                  storageKey={`portfolio_${portfolioId}`}
                />
              ) : holdingsView === "divreturns" ? (
                transactionsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-8 h-8 border-2 border-positive/30 border-t-emerald-500 rounded-full animate-spin" />
                      <span className="text-muted-foreground text-sm">Loading dividend data...</span>
                    </div>
                  </div>
                ) : (
                  <DividendReturnsTable
                    holdings={activeHoldings}
                    transactions={transactionsData}
                    usdCadRate={rate}
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
                    <Button variant="outline" size="sm" className="self-start" onClick={() => setShowCsvImport(true)}>
                      <Upload className="size-3.5" />
                      Import CSV
                    </Button>
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
                        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <span className="text-muted-foreground text-sm">Loading transactions...</span>
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
            </PanelBody>
          </Panel>

        </div>

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
    </>
  );
}
