"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { WatchlistItem } from "@/lib/db/schema";
import {
  WatchlistItemWithQuote,
  NewsArticle,
  PortfolioDashboardData,
  AlertRuleDTO,
  AlertHistoryEntry,
  TriggeredAlertSummary,
} from "@/types";
import { AddSymbolForm } from "@/components/watchlist/add-symbol-form";
import { WatchlistTable } from "@/components/watchlist/watchlist-table";
import { DividendTable } from "@/components/watchlist/dividend-table";
import { NewsTable } from "@/components/watchlist/news-table";
import { MarketOverview } from "@/components/markets/market-overview";
import { PortfolioSummaryList } from "@/components/portfolio/portfolio-summary-list";
import { PortfolioStats } from "@/components/portfolio/portfolio-stats";
import { MainNav, MainNavTabs, getInitialTab, getInitialWatchlistId, type Tab } from "@/components/layout/main-nav";
import { formatUpdatedTime } from "@/lib/utils";
import { AlertsPanel } from "@/components/alerts/alerts-panel";
import {
  triggerWatchlistAlerts,
  fetchAlertRules,
  createAlertRule,
  deleteAlertRule,
  resetAlertRule,
  fetchAlertHistory,
} from "@/lib/alerts/api";
import type { CreateAlertRuleInput } from "@/lib/alerts/api";

// Helper to get tab from URL on initial load
function getTabFromUrl(): Tab {
  if (typeof window === "undefined") return "general";
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab && ["general", "watchlist", "portfolios"].includes(tab)) {
    return tab as Tab;
  }
  return getInitialTab();
}

export default function Dashboard() {
  // Tab state - read from URL immediately
  const [activeTab, setActiveTab] = useState<Tab>(getTabFromUrl);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<number | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [portfoliosLoading, setPortfoliosLoading] = useState(true);

  // Clean up URL and get watchlist ID after mount
  useEffect(() => {
    // Clean up URL params after reading
    const params = new URLSearchParams(window.location.search);
    if (params.has("tab")) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    const initialWatchlistId = getInitialWatchlistId();
    if (initialWatchlistId) {
      setSelectedWatchlistId(initialWatchlistId);
    }
  }, []);

  // Watchlist state
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItemWithQuote[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [watchlistUpdatedAt, setWatchlistUpdatedAt] = useState<Date | null>(null);
  const [watchlistView, setWatchlistView] = useState<"performance" | "dividend" | "news">("performance");
  const [watchlistNews, setWatchlistNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [watchlistAlerts, setWatchlistAlerts] = useState<TriggeredAlertSummary[]>([]);
  const [watchlistRules, setWatchlistRules] = useState<AlertRuleDTO[]>([]);
  const [watchlistHistory, setWatchlistHistory] = useState<AlertHistoryEntry[]>([]);
  const [alertsPanelOpen, setAlertsPanelOpen] = useState(false);
  const [focusedAlertSymbol, setFocusedAlertSymbol] = useState<string | null>(null);

  // Portfolio state for the list view
  const [portfolios, setPortfolios] = useState<{ id: number; name: string; currency: string; createdAt: string }[]>([]);
  const [dashboardData, setDashboardData] = useState<PortfolioDashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const fetchPortfolios = async () => {
    try {
      const response = await fetch("/api/portfolios");
      const data = await response.json();
      setPortfolios(data);

      // Auto-select first portfolio if none selected
      if (data.length > 0 && !selectedPortfolioId) {
        setSelectedPortfolioId(data[0].id);
      }
    } catch (error) {
    } finally {
      setPortfoliosLoading(false);
    }
  };

  const fetchDashboardData = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const response = await fetch("/api/portfolios/summary");
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      }
    } catch (error) {
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const refreshAlertRules = useCallback(async () => {
    const data = await fetchAlertRules("watchlist");
    setWatchlistRules(data);
  }, []);

  const refreshAlertHistory = useCallback(async () => {
    const data = await fetchAlertHistory("watchlist", 40);
    setWatchlistHistory(data);
  }, []);

  const fetchWatchlistItems = useCallback(async (watchlistId: number, refresh = false) => {
    setWatchlistLoading(true);
    try {
      const response = await fetch(`/api/watchlist?watchlistId=${watchlistId}`);
      const items: WatchlistItem[] = await response.json();

      // Fetch quotes, historical changes, dividend info, and price ranges for each item
      const itemsWithQuotes: WatchlistItemWithQuote[] = await Promise.all(
        items.map(async (item) => {
          try {
            const url = refresh
              ? `/api/stocks/${item.symbol}?changes=true&dividends=true&range=true&refresh=true`
              : `/api/stocks/${item.symbol}?changes=true&dividends=true&range=true`;
            const quoteResponse = await fetch(url);
            if (quoteResponse.ok) {
              const quoteData = await quoteResponse.json();
              return {
                ...item,
                price: quoteData.quote?.price,
                change: quoteData.quote?.change,
                changePercent: quoteData.quote?.changePercent,
                currency: quoteData.quote?.currency,
                shortName: quoteData.quote?.shortName,
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
                volume: quoteData.quote?.volume,
                avgVolume: quoteData.quote?.avgVolume,
              };
            }
          } catch {
            // Ignore quote fetch errors
          }
          return { ...item };
        })
      );

      setWatchlistItems(itemsWithQuotes);
      setWatchlistUpdatedAt(new Date());
      const triggered = await triggerWatchlistAlerts(itemsWithQuotes);
      setWatchlistAlerts(triggered);
      if (triggered.length > 0) {
        refreshAlertHistory();
      }
    } catch (error) {
    } finally {
      setWatchlistLoading(false);
    }
  }, [refreshAlertHistory]);

  // Fetch initial watchlist if we have a selected ID
  useEffect(() => {
    const initWatchlist = async () => {
      // If no watchlist selected, try to get the first one
      if (!selectedWatchlistId) {
        try {
          const response = await fetch("/api/watchlists");
          const watchlists = await response.json();
          if (watchlists.length > 0) {
            setSelectedWatchlistId(watchlists[0].id);
          }
        } catch (error) {
        }
      }
    };
    initWatchlist();
  }, [selectedWatchlistId]);

  useEffect(() => {
    fetchPortfolios();
  }, []);

  useEffect(() => {
    if (activeTab === "portfolios") {
      fetchDashboardData();
    }
  }, [activeTab, fetchDashboardData]);

  useEffect(() => {
    if (selectedWatchlistId) {
      fetchWatchlistItems(selectedWatchlistId);
    }
  }, [selectedWatchlistId, fetchWatchlistItems]);

  useEffect(() => {
    refreshAlertRules();
    refreshAlertHistory();
  }, [selectedWatchlistId, refreshAlertRules, refreshAlertHistory]);

  useEffect(() => {
    if (alertsPanelOpen) {
      refreshAlertRules();
      refreshAlertHistory();
    }
  }, [alertsPanelOpen, refreshAlertRules, refreshAlertHistory]);

  const fetchWatchlistNews = useCallback(async () => {
    if (watchlistItems.length === 0) {
      setWatchlistNews([]);
      return;
    }

    setNewsLoading(true);
    try {
      const symbols = watchlistItems.map((item) => item.symbol).join(",");
      const response = await fetch(`/api/news?symbols=${symbols}&limit=20`);
      if (response.ok) {
        const data = await response.json();
        setWatchlistNews(data);
      }
    } catch (error) {
    } finally {
      setNewsLoading(false);
    }
  }, [watchlistItems]);

  useEffect(() => {
    if (watchlistView === "news" && watchlistItems.length > 0) {
      fetchWatchlistNews();
    }
  }, [watchlistView, watchlistItems.length, fetchWatchlistNews]);

  const handleRemoveSymbol = async (id: number) => {
    try {
      await fetch(`/api/watchlist?id=${id}`, { method: "DELETE" });
      if (selectedWatchlistId) {
        fetchWatchlistItems(selectedWatchlistId);
      }
    } catch (error) {
    }
  };

  const handleRefresh = async () => {
    if (selectedWatchlistId) {
      await fetchWatchlistItems(selectedWatchlistId, true);
    }
  };

  const handleCreateWatchlistRule = async (input: CreateAlertRuleInput) => {
    const rule = await createAlertRule(input);
    setWatchlistRules((prev) => [...prev, rule]);
    refreshAlertHistory();
  };

  const handleDeleteWatchlistRule = async (id: number) => {
    await deleteAlertRule(id);
    setWatchlistRules((prev) => prev.filter((rule) => rule.id !== id));
  };

  const handleResetWatchlistRule = async (id: number) => {
    await resetAlertRule(id);
    setWatchlistRules((prev) =>
      prev.map((rule) => (rule.id === id ? { ...rule, isMuted: false, needsRecovery: false, cooldownUntil: null } : rule))
    );
  };

  const activeWatchlistRules = watchlistRules.filter((rule) =>
    rule.scope === "watchlist" &&
    watchlistItems.some((item) => item.id === rule.watchlistItemId || item.symbol === rule.symbol)
  );

  const watchlistOptions = watchlistItems.map((item) => ({
    id: item.id,
    label: item.shortName ?? item.symbol,
    symbol: item.symbol,
  }));

  const watchlistAlertStates = useMemo(() => {
    const triggeredSymbols = new Set(watchlistAlerts.map((alert) => alert.symbol));
    const states: Record<number, { count: number; triggered: boolean }> = {};
    watchlistItems.forEach((item) => {
      const count = watchlistRules.filter(
        (rule) => rule.scope === "watchlist" && (rule.watchlistItemId === item.id || rule.symbol === item.symbol)
      ).length;
      states[item.id] = {
        count,
        triggered: triggeredSymbols.has(item.symbol),
      };
    });
    return states;
  }, [watchlistItems, watchlistRules, watchlistAlerts]);

  const openAlertsPanel = (symbol?: string) => {
    setFocusedAlertSymbol(symbol ?? null);
    setAlertsPanelOpen(true);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <MainNav
        onOpenAlerts={() => openAlertsPanel()}
        alertCount={watchlistAlerts.length}
        hasTriggeredAlerts={watchlistAlerts.length > 0}
      />

      {/* Tabs */}
      <div className="space-y-6">
        <MainNavTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          selectedWatchlistId={selectedWatchlistId}
          onSelectWatchlist={setSelectedWatchlistId}
          selectedPortfolioId={selectedPortfolioId}
          onSelectPortfolio={setSelectedPortfolioId}
        >
          {activeTab === "watchlist" && selectedWatchlistId && (
            <AddSymbolForm
              watchlistId={selectedWatchlistId}
              onSymbolAdded={() => fetchWatchlistItems(selectedWatchlistId)}
              compact
            />
          )}
        </MainNavTabs>

        {/* General Content */}
        {activeTab === "general" && <MarketOverview />}

        {/* Watchlist Content */}
        {activeTab === "watchlist" && (
          <div className="space-y-6">
            {selectedWatchlistId ? (
              <>
                <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-blue-500/10 to-transparent">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <div>
                          <h2 className="font-semibold text-black dark:text-white">Watchlist</h2>
                          <p className="text-xs text-black/50 dark:text-white/50">{watchlistItems.length} symbols</p>
                        </div>
                      </div>
                      {/* View tabs */}
                      <div className="flex gap-1 p-1 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                        <button
                          onClick={() => setWatchlistView("performance")}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                            watchlistView === "performance"
                              ? "bg-blue-500 text-white"
                              : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                          }`}
                        >
                          Performance
                        </button>
                        <button
                          onClick={() => setWatchlistView("dividend")}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                            watchlistView === "dividend"
                              ? "bg-blue-500 text-white"
                              : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                          }`}
                        >
                          Dividend
                        </button>
                        <button
                          onClick={() => setWatchlistView("news")}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                            watchlistView === "news"
                              ? "bg-blue-500 text-white"
                              : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                          }`}
                        >
                          News
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {watchlistUpdatedAt && (
                        <span className="text-xs text-black/50 dark:text-white/50">
                          {formatUpdatedTime(watchlistUpdatedAt)}
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={watchlistLoading}
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 hover:border-black/20 dark:hover:border-white/20"
                      >
                        {watchlistLoading ? (
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
                  <div className="p-4">
                    {watchlistAlerts.length > 0 && (
                      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div>
                            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                              {watchlistAlerts.length} alert{watchlistAlerts.length > 1 ? "s" : ""} triggered
                            </p>
                            <p className="text-xs text-amber-900/70 dark:text-amber-100/70">Based on the latest manual refresh.</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => openAlertsPanel()}>
                            Review alerts
                          </Button>
                        </div>
                        <ul className="mt-3 space-y-1.5 text-sm text-amber-900/80 dark:text-amber-100/80">
                          {watchlistAlerts.slice(0, 3).map((alert) => (
                            <li key={alert.id}>
                              <span className="font-semibold">{alert.symbol}</span> · {alert.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {watchlistLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                          <p className="text-black/50 dark:text-white/50">Loading watchlist...</p>
                        </div>
                      </div>
                    ) : watchlistView === "performance" ? (
                      <WatchlistTable
                        items={watchlistItems}
                        onRemoveSymbol={handleRemoveSymbol}
                        storageKey={`watchlist_${selectedWatchlistId}`}
                        alertStates={watchlistAlertStates}
                        onOpenAlerts={(symbol) => openAlertsPanel(symbol)}
                      />
                    ) : watchlistView === "dividend" ? (
                      <DividendTable
                        items={watchlistItems}
                        onRemoveSymbol={handleRemoveSymbol}
                        storageKey={`watchlist_${selectedWatchlistId}`}
                      />
                    ) : (
                      <NewsTable
                        articles={watchlistNews}
                        loading={newsLoading}
                      />
                    )}
                  </div>
                </div>

              </>
            ) : (
              <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-12">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-black dark:text-white mb-2">No Watchlist Selected</h3>
                  <p className="text-black/50 dark:text-white/50">Create your first watchlist using the dropdown above.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Portfolios Content */}
        {activeTab === "portfolios" && (
          <div className="space-y-6">
            <PortfolioSummaryList data={dashboardData} loading={dashboardLoading} />
            <PortfolioStats data={dashboardData} loading={dashboardLoading} />
          </div>
        )}
      </div>

      <AlertsPanel
        open={alertsPanelOpen}
        scope="watchlist"
        sourceOptions={watchlistOptions}
        rules={activeWatchlistRules}
        alerts={watchlistAlerts}
        history={watchlistHistory}
        focusSymbol={focusedAlertSymbol}
        onClose={() => {
          setAlertsPanelOpen(false);
          setFocusedAlertSymbol(null);
        }}
        onCreateRule={handleCreateWatchlistRule}
        onDeleteRule={handleDeleteWatchlistRule}
        onResetRule={handleResetWatchlistRule}
      />
    </div>
  );
}
