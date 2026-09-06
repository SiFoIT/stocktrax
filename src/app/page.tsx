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
import { Loader2, RefreshCw } from "lucide-react";
import { AddSymbolForm } from "@/components/watchlist/add-symbol-form";
import { Panel, PanelBody, PanelHeader, type PanelTab } from "@/components/ui/panel";
import { WatchlistTable } from "@/components/watchlist/watchlist-table";
import { DividendTable } from "@/components/watchlist/dividend-table";
import { InsiderTable } from "@/components/watchlist/insider-table";
import { NewsTable } from "@/components/watchlist/news-table";
import { MarketOverview } from "@/components/markets/market-overview";
import { PortfolioSummaryList } from "@/components/portfolio/portfolio-summary-list";
import { PortfolioStats } from "@/components/portfolio/portfolio-stats";
import { AppHeader, getInitialTab, getInitialWatchlistId, getInitialScreenId, type Tab } from "@/components/layout/app-header";
import { ScreenContent } from "@/components/screener/screen-content";
import { fetchScreens, type ScreenDTO } from "@/lib/screener/api";
import { useRelativeTime } from "@/lib/hooks/use-relative-time";
import { AlertsPanel } from "@/components/alerts/alerts-panel";
import {
  triggerWatchlistAlerts,
  fetchAlertRules,
  createAlertRule,
  updateAlertRule,
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
  if (tab && ["general", "watchlist", "portfolios", "screens"].includes(tab)) {
    return tab as Tab;
  }
  return getInitialTab();
}

type WatchlistView = "performance" | "dividend" | "insider" | "news";

const WATCHLIST_VIEWS: readonly PanelTab<WatchlistView>[] = [
  { key: "performance", label: "Performance" },
  { key: "dividend", label: "Dividend" },
  { key: "insider", label: "Insider" },
  { key: "news", label: "News" },
];

export default function Dashboard() {
  // Tab state - read from URL immediately
  const [activeTab, setActiveTab] = useState<Tab>(getTabFromUrl);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<number | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [selectedScreenId, setSelectedScreenId] = useState<number | null>(null);
  const [screens, setScreens] = useState<ScreenDTO[]>([]);
  const [currentScreen, setCurrentScreen] = useState<ScreenDTO | null>(null);

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

    const initialScreenId = getInitialScreenId();
    if (initialScreenId) {
      setSelectedScreenId(initialScreenId);
    }
  }, []);

  // Watchlist state
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItemWithQuote[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [watchlistUpdatedAt, setWatchlistUpdatedAt] = useState<Date | null>(null);
  const [watchlistView, setWatchlistView] = useState<WatchlistView>("performance");
  const [watchlistNews, setWatchlistNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [watchlistAlerts, setWatchlistAlerts] = useState<TriggeredAlertSummary[]>([]);
  const [watchlistRules, setWatchlistRules] = useState<AlertRuleDTO[]>([]);
  const [watchlistHistory, setWatchlistHistory] = useState<AlertHistoryEntry[]>([]);
  const [alertsPanelOpen, setAlertsPanelOpen] = useState(false);
  const [focusedAlertSymbol, setFocusedAlertSymbol] = useState<string | null>(null);

  const watchlistUpdatedLabel = useRelativeTime(watchlistUpdatedAt);

  // Portfolio state for the list view
  const [dashboardData, setDashboardData] = useState<PortfolioDashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const response = await fetch("/api/portfolios/summary");
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      }
    } catch {
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
              ? `/api/stocks/${item.symbol}?changes=true&dividends=true&insider=true&range=true&refresh=true`
              : `/api/stocks/${item.symbol}?changes=true&dividends=true&insider=true&range=true`;
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
    } catch {
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
        } catch {
        }
      }
    };
    initWatchlist();
  }, [selectedWatchlistId]);

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

  // Screens: fetch list and initialize selection
  useEffect(() => {
    if (activeTab === "screens") {
      const loadScreens = async () => {
        const data = await fetchScreens();
        setScreens(data);
        if (!selectedScreenId && data.length > 0) {
          setSelectedScreenId(data[0].id);
        }
      };
      loadScreens();
    }
  }, [activeTab, selectedScreenId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Screens: update currentScreen when selection changes
  useEffect(() => {
    if (selectedScreenId && screens.length > 0) {
      const found = screens.find((s) => s.id === selectedScreenId);
      setCurrentScreen(found ?? null);
    } else {
      setCurrentScreen(null);
    }
  }, [selectedScreenId, screens]);

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
    } catch {
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
    } catch {
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

  const handleUpdateWatchlistRule = async (id: number, updates: Partial<CreateAlertRuleInput>) => {
    const updated = await updateAlertRule(id, updates);
    setWatchlistRules((prev) => prev.map((rule) => (rule.id === id ? updated : rule)));
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
    const states: Record<number, { hasRules: boolean; triggered: boolean }> = {};
    watchlistItems.forEach((item) => {
      const hasRules = watchlistRules.some(
        (rule) => rule.scope === "watchlist" && (rule.watchlistItemId === item.id || rule.symbol === item.symbol)
      );
      const hasRecoveryOrMuted = watchlistRules.some(
        (rule) => rule.scope === "watchlist" && (rule.watchlistItemId === item.id || rule.symbol === item.symbol) && (rule.needsRecovery || rule.isMuted)
      );
      states[item.id] = {
        hasRules,
        triggered: triggeredSymbols.has(item.symbol) || hasRecoveryOrMuted,
      };
    });
    return states;
  }, [watchlistItems, watchlistRules, watchlistAlerts]);

  const openAlertsPanel = (symbol?: string) => {
    setFocusedAlertSymbol(symbol ?? null);
    setAlertsPanelOpen(true);
  };

  return (
    <>
      <AppHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedWatchlistId={selectedWatchlistId}
        onSelectWatchlist={setSelectedWatchlistId}
        selectedPortfolioId={selectedPortfolioId}
        onSelectPortfolio={setSelectedPortfolioId}
        selectedScreenId={selectedScreenId}
        onSelectScreen={setSelectedScreenId}
        onOpenAlerts={() => openAlertsPanel()}
        alertCount={watchlistAlerts.length}
        hasTriggeredAlerts={watchlistAlerts.length > 0}
      />

      <div className="mx-auto max-w-[1536px] space-y-4 px-6 py-5">

        {/* General Content */}
        {activeTab === "general" && <MarketOverview />}

        {/* Watchlist Content */}
        {activeTab === "watchlist" && (
          <div className="space-y-6">
            {selectedWatchlistId ? (
              <>
                <Panel>
                  <PanelHeader
                    title="Watchlist"
                    meta={`${watchlistItems.length} symbols`}
                    tabs={WATCHLIST_VIEWS}
                    activeTab={watchlistView}
                    onTabChange={setWatchlistView}
                    right={
                      <>
                        <AddSymbolForm
                          watchlistId={selectedWatchlistId}
                          onSymbolAdded={() => fetchWatchlistItems(selectedWatchlistId)}
                          compact
                        />
                        {watchlistUpdatedLabel && <span>{watchlistUpdatedLabel}</span>}
                        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={watchlistLoading}>
                          {watchlistLoading ? (
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
                    {watchlistAlerts.length > 0 && (
                      <div className="m-4 rounded-md border border-warning/30 bg-warning/10 p-3">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {watchlistAlerts.length} alert{watchlistAlerts.length > 1 ? "s" : ""} triggered
                            </p>
                            <p className="text-xs text-muted-foreground">Based on the latest manual refresh.</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => openAlertsPanel()}>
                            Review alerts
                          </Button>
                        </div>
                        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {watchlistAlerts.slice(0, 3).map((alert) => (
                            <li key={alert.id}>
                              <span className="font-semibold">{alert.symbol}</span> · {alert.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {watchlistLoading ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Loading watchlist…
                      </div>
                    ) : watchlistView === "performance" ? (
                      <WatchlistTable
                        key={`watchlist_${selectedWatchlistId}`}
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
                    ) : watchlistView === "insider" ? (
                      <InsiderTable
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
                  </PanelBody>
                </Panel>
              </>
            ) : (
              <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
                <p className="text-sm font-medium text-foreground">No watchlist selected</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create your first watchlist from the Watchlists menu above.
                </p>
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

        {/* Screens Content */}
        {activeTab === "screens" && (
          <ScreenContent
            screen={currentScreen}
            onScreenUpdated={(updated) => {
              setScreens((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
              setCurrentScreen(updated);
            }}
          />
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
        onUpdateRule={handleUpdateWatchlistRule}
        onDeleteRule={handleDeleteWatchlistRule}
        onResetRule={handleResetWatchlistRule}
      />
    </>
  );
}
