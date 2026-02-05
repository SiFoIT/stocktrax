"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WatchlistItem } from "@/lib/db/schema";
import { WatchlistItemWithQuote, NewsArticle } from "@/types";
import { AddSymbolForm } from "@/components/watchlist/add-symbol-form";
import { WatchlistTable } from "@/components/watchlist/watchlist-table";
import { DividendTable } from "@/components/watchlist/dividend-table";
import { NewsTable } from "@/components/watchlist/news-table";
import { PriceChart } from "@/components/charts/price-chart";
import { MarketOverview } from "@/components/markets/market-overview";
import { MainNav, MainNavTabs, getInitialTab, getInitialWatchlistId, type Tab } from "@/components/layout/main-nav";

function formatUpdatedTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return "Updated just now";
  } else if (diffMins < 60) {
    return `Updated ${diffMins} min ago`;
  } else {
    return `Updated ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
}

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
  const [selectedSymbol, setSelectedSymbol] = useState<string | undefined>();
  const [watchlistUpdatedAt, setWatchlistUpdatedAt] = useState<Date | null>(null);
  const [watchlistView, setWatchlistView] = useState<"performance" | "dividend" | "news">("performance");
  const [watchlistNews, setWatchlistNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  // Portfolio state for the list view
  const [portfolios, setPortfolios] = useState<{ id: number; name: string; currency: string; createdAt: string }[]>([]);

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
      console.error("Error fetching portfolios:", error);
    } finally {
      setPortfoliosLoading(false);
    }
  };

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

      // Auto-select first symbol if none selected
      if (itemsWithQuotes.length > 0) {
        setSelectedSymbol(itemsWithQuotes[0].symbol);
      } else {
        setSelectedSymbol(undefined);
      }
    } catch (error) {
      console.error("Error fetching watchlist items:", error);
    } finally {
      setWatchlistLoading(false);
    }
  }, []);

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
          console.error("Error fetching watchlists:", error);
        }
      }
    };
    initWatchlist();
  }, [selectedWatchlistId]);

  useEffect(() => {
    fetchPortfolios();
  }, []);

  useEffect(() => {
    if (selectedWatchlistId) {
      fetchWatchlistItems(selectedWatchlistId);
    }
  }, [selectedWatchlistId, fetchWatchlistItems]);

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
      console.error("Error fetching watchlist news:", error);
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

      // If we're removing the selected symbol, clear selection
      const removedItem = watchlistItems.find((item) => item.id === id);
      if (removedItem?.symbol === selectedSymbol) {
        const remaining = watchlistItems.filter((item) => item.id !== id);
        setSelectedSymbol(remaining.length > 0 ? remaining[0].symbol : undefined);
      }

      if (selectedWatchlistId) {
        fetchWatchlistItems(selectedWatchlistId);
      }
    } catch (error) {
      console.error("Error removing symbol:", error);
    }
  };

  const handleSelectSymbol = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  const handleRefresh = async () => {
    if (selectedWatchlistId) {
      await fetchWatchlistItems(selectedWatchlistId, true);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <MainNav />

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
                        selectedSymbol={selectedSymbol}
                        onSelectSymbol={handleSelectSymbol}
                        onRemoveSymbol={handleRemoveSymbol}
                      />
                    ) : watchlistView === "dividend" ? (
                      <DividendTable
                        items={watchlistItems}
                        selectedSymbol={selectedSymbol}
                        onSelectSymbol={handleSelectSymbol}
                        onRemoveSymbol={handleRemoveSymbol}
                      />
                    ) : (
                      <NewsTable
                        articles={watchlistNews}
                        loading={newsLoading}
                      />
                    )}
                  </div>
                </div>

                {selectedSymbol && (
                  <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 overflow-hidden">
                    <div className="flex items-center gap-3 px-6 py-4 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-purple-500/10 to-transparent">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                        </svg>
                      </div>
                      <h2 className="font-semibold text-black dark:text-white">{selectedSymbol} Price Chart</h2>
                    </div>
                    <div className="p-4">
                      <PriceChart
                        symbol={selectedSymbol}
                        storageKey={`watchlist_${selectedWatchlistId}`}
                        timeframeChanges={(() => {
                          const item = watchlistItems.find(i => i.symbol === selectedSymbol);
                          if (!item) return undefined;
                          return {
                            "1D": item.changePercent,
                            "5D": item.change5D,
                            "3M": item.change3M,
                            "1Y": item.change1Y,
                            "5Y": item.change5Y,
                          };
                        })()}
                      />
                    </div>
                  </div>
                )}
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
          <div className="space-y-4">
            {portfoliosLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                  <p className="text-black/50 dark:text-white/50">Loading portfolios...</p>
                </div>
              </div>
            ) : portfolios.length === 0 ? (
              <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-12">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-black dark:text-white mb-2">No Portfolios Yet</h3>
                  <p className="text-black/50 dark:text-white/50">Create your first portfolio using the dropdown above.</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {portfolios.map((portfolio) => (
                  <Link
                    key={portfolio.id}
                    href={`/portfolio/${portfolio.id}`}
                    className="block rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-5 hover:border-emerald-500/30 hover:from-emerald-500/5 hover:to-transparent transition-all group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center group-hover:from-emerald-500/30 group-hover:to-teal-500/30 transition-all">
                          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <h3 className="font-semibold text-black dark:text-white group-hover:text-emerald-400 transition-colors">
                          {portfolio.name}
                        </h3>
                      </div>
                      <svg className="w-5 h-5 text-black/30 dark:text-white/30 group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    <p className="text-xs text-black/40 dark:text-white/40">
                      Created {new Date(portfolio.createdAt).toLocaleDateString()}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
