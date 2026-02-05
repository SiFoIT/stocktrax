"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Portfolio, Watchlist, WatchlistItem } from "@/lib/db/schema";
import { WatchlistItemWithQuote, NewsArticle } from "@/types";
import { AddSymbolForm } from "@/components/watchlist/add-symbol-form";
import { WatchlistTable } from "@/components/watchlist/watchlist-table";
import { DividendTable } from "@/components/watchlist/dividend-table";
import { NewsTable } from "@/components/watchlist/news-table";
import { PriceChart } from "@/components/charts/price-chart";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { MarketOverview } from "@/components/markets/market-overview";
import { getDefaultTab, type DefaultTab } from "@/components/settings/general-settings-modal";

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

export default function Dashboard() {
  // Tab state - initialized from localStorage preference
  const [activeTab, setActiveTab] = useState<DefaultTab>("general");

  // Initialize tab from localStorage after mount
  useEffect(() => {
    setActiveTab(getDefaultTab());
  }, []);

  // Portfolio state
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [newPortfolioCurrency, setNewPortfolioCurrency] = useState<"USD" | "CAD">("USD");
  const [portfoliosLoading, setPortfoliosLoading] = useState(true);
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);
  const [editingPortfolioId, setEditingPortfolioId] = useState<number | null>(null);
  const [editingPortfolioName, setEditingPortfolioName] = useState("");

  // Watchlist state
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<number | null>(null);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItemWithQuote[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState<string | undefined>();
  const [watchlistUpdatedAt, setWatchlistUpdatedAt] = useState<Date | null>(null);
  const [watchlistView, setWatchlistView] = useState<"performance" | "dividend" | "news">("performance");
  const [watchlistNews, setWatchlistNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  // Dropdown state
  const [showWatchlistDropdown, setShowWatchlistDropdown] = useState(false);
  const [showPortfolioDropdown, setShowPortfolioDropdown] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [creatingWatchlist, setCreatingWatchlist] = useState(false);
  const [editingWatchlistId, setEditingWatchlistId] = useState<number | null>(null);
  const [editingWatchlistName, setEditingWatchlistName] = useState("");
  const watchlistDropdownRef = useRef<HTMLDivElement>(null);
  const portfolioDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (watchlistDropdownRef.current && !watchlistDropdownRef.current.contains(e.target as Node)) {
        setShowWatchlistDropdown(false);
      }
      if (portfolioDropdownRef.current && !portfolioDropdownRef.current.contains(e.target as Node)) {
        setShowPortfolioDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const fetchWatchlists = async () => {
    try {
      const response = await fetch("/api/watchlists");
      const data: Watchlist[] = await response.json();
      setWatchlists(data);

      // Auto-select first watchlist if none selected
      if (data.length > 0 && !selectedWatchlistId) {
        setSelectedWatchlistId(data[0].id);
      }
    } catch (error) {
      console.error("Error fetching watchlists:", error);
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

  useEffect(() => {
    fetchPortfolios();
    fetchWatchlists();
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

  const handleCreateWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWatchlistName.trim()) return;

    setCreatingWatchlist(true);
    try {
      const response = await fetch("/api/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWatchlistName }),
      });

      if (response.ok) {
        const newWatchlist = await response.json();
        setNewWatchlistName("");
        await fetchWatchlists();
        setSelectedWatchlistId(newWatchlist.id);
        setShowWatchlistDropdown(false);
      }
    } catch (error) {
      console.error("Error creating watchlist:", error);
    } finally {
      setCreatingWatchlist(false);
    }
  };

  const handleDeleteWatchlist = async (id: number) => {
    if (!confirm("Are you sure you want to delete this watchlist?")) return;

    try {
      await fetch(`/api/watchlists?id=${id}`, { method: "DELETE" });
      await fetchWatchlists();

      // Select another watchlist if we deleted the current one
      if (selectedWatchlistId === id) {
        const remaining = watchlists.filter((w) => w.id !== id);
        setSelectedWatchlistId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (error) {
      console.error("Error deleting watchlist:", error);
    }
  };

  const handleRenameWatchlist = async (id: number) => {
    if (!editingWatchlistName.trim()) return;

    try {
      await fetch(`/api/watchlists?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingWatchlistName }),
      });
      await fetchWatchlists();
      setEditingWatchlistId(null);
      setEditingWatchlistName("");
    } catch (error) {
      console.error("Error renaming watchlist:", error);
    }
  };

  const handleCreatePortfolio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPortfolioName.trim()) return;

    setCreatingPortfolio(true);
    try {
      const response = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPortfolioName,
          currency: newPortfolioCurrency,
        }),
      });

      if (response.ok) {
        const newPortfolio = await response.json();
        setNewPortfolioName("");
        await fetchPortfolios();
        setSelectedPortfolioId(newPortfolio.id);
        setShowPortfolioDropdown(false);
      }
    } catch (error) {
      console.error("Error creating portfolio:", error);
    } finally {
      setCreatingPortfolio(false);
    }
  };

  const handleDeletePortfolio = async (id: number) => {
    if (!confirm("Are you sure you want to delete this portfolio?")) return;

    try {
      await fetch(`/api/portfolios?id=${id}`, { method: "DELETE" });
      await fetchPortfolios();

      // Select another portfolio if we deleted the current one
      if (selectedPortfolioId === id) {
        const remaining = portfolios.filter((p) => p.id !== id);
        setSelectedPortfolioId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (error) {
      console.error("Error deleting portfolio:", error);
    }
  };

  const handleRenamePortfolio = async (id: number) => {
    if (!editingPortfolioName.trim()) return;

    try {
      await fetch(`/api/portfolios?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingPortfolioName }),
      });
      await fetchPortfolios();
      setEditingPortfolioId(null);
      setEditingPortfolioName("");
    } catch (error) {
      console.error("Error renaming portfolio:", error);
    }
  };

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

  const selectedWatchlist = watchlists.find((w) => w.id === selectedWatchlistId);
  const selectedPortfolio = portfolios.find((p) => p.id === selectedPortfolioId);

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-black to-black/70 dark:from-white dark:to-white/70 bg-clip-text text-transparent">
              StockTrax
            </h1>
          </div>
          <p className="text-black/50 dark:text-black/50 dark:text-white/50 text-sm">Track your investments with real-time data</p>
        </div>
        <SettingsMenu />
      </div>

      {/* Tabs */}
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-2 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
            {/* General Tab */}
            <button
              onClick={() => {
                setActiveTab("general");
                setShowWatchlistDropdown(false);
                setShowPortfolioDropdown(false);
              }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-all ${
                activeTab === "general"
                  ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-black dark:text-white"
                  : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              General
            </button>

            {/* Watchlists Tab with Dropdown */}
            <div className="relative" ref={watchlistDropdownRef}>
              <div
                className={`flex items-center rounded-lg transition-all ${
                  activeTab === "watchlist"
                    ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-black dark:text-white"
                    : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <button
                  onClick={() => {
                    setActiveTab("watchlist");
                    setShowWatchlistDropdown(false);
                    setShowPortfolioDropdown(false);
                  }}
                  className="flex items-center gap-2 pl-4 pr-1 py-2"
                >
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Watchlists
                </button>
                <button
                  onClick={() => {
                    setActiveTab("watchlist");
                    setShowWatchlistDropdown(!showWatchlistDropdown);
                    setShowPortfolioDropdown(false);
                  }}
                  className="px-2 py-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-r-lg transition-colors"
                >
                  <svg className={`w-4 h-4 text-black/50 dark:text-white/50 transition-transform ${showWatchlistDropdown ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {showWatchlistDropdown && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-blue-500/10 to-transparent">
                    <form onSubmit={handleCreateWatchlist} className="flex gap-2">
                      <Input
                        placeholder="New watchlist name"
                        value={newWatchlistName}
                        onChange={(e) => setNewWatchlistName(e.target.value)}
                        className="h-9 text-sm bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 focus:border-blue-500/50"
                      />
                      <Button type="submit" size="sm" disabled={creatingWatchlist} className="bg-blue-500 hover:bg-blue-600">
                        Add
                      </Button>
                    </form>
                  </div>
                  <div className="max-h-64 overflow-auto">
                    {watchlists.length === 0 ? (
                      <p className="p-4 text-sm text-black/50 dark:text-white/50 text-center">No watchlists yet</p>
                    ) : (
                      watchlists.map((watchlist) => (
                        <div
                          key={watchlist.id}
                          className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-all ${
                            watchlist.id === selectedWatchlistId
                              ? "bg-gradient-to-r from-blue-500/20 to-transparent border-l-2 border-blue-500"
                              : "hover:bg-black/5 dark:hover:bg-white/5"
                          }`}
                          onClick={() => {
                            if (editingWatchlistId !== watchlist.id) {
                              setSelectedWatchlistId(watchlist.id);
                              setShowWatchlistDropdown(false);
                            }
                          }}
                        >
                          {editingWatchlistId === watchlist.id ? (
                            <form
                              className="flex gap-2 flex-1 mr-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleRenameWatchlist(watchlist.id);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Input
                                value={editingWatchlistName}
                                onChange={(e) => setEditingWatchlistName(e.target.value)}
                                className="h-7 text-sm bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    setEditingWatchlistId(null);
                                    setEditingWatchlistName("");
                                  }
                                }}
                              />
                              <Button type="submit" size="sm" className="h-7 px-2 bg-emerald-500 hover:bg-emerald-600">
                                Save
                              </Button>
                            </form>
                          ) : (
                            <span className="text-sm font-medium">{watchlist.name}</span>
                          )}
                          {editingWatchlistId !== watchlist.id && (
                            <div className="flex gap-1">
                              <button
                                className="p-1.5 rounded-lg text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingWatchlistId(watchlist.id);
                                  setEditingWatchlistName(watchlist.name);
                                }}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                className="p-1.5 rounded-lg text-black/40 dark:text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteWatchlist(watchlist.id);
                                }}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Portfolios Tab with Dropdown */}
            <div className="relative" ref={portfolioDropdownRef}>
              <div
                className={`flex items-center rounded-lg transition-all ${
                  activeTab === "portfolios"
                    ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-black dark:text-white"
                    : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <button
                  onClick={() => {
                    setActiveTab("portfolios");
                    setShowPortfolioDropdown(false);
                    setShowWatchlistDropdown(false);
                  }}
                  className="flex items-center gap-2 pl-4 pr-1 py-2"
                >
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Portfolios
                </button>
                <button
                  onClick={() => {
                    setActiveTab("portfolios");
                    setShowPortfolioDropdown(!showPortfolioDropdown);
                    setShowWatchlistDropdown(false);
                  }}
                  className="px-2 py-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-r-lg transition-colors"
                >
                  <svg className={`w-4 h-4 text-black/50 dark:text-white/50 transition-transform ${showPortfolioDropdown ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {showPortfolioDropdown && (
                <div className="absolute top-full left-0 mt-2 w-80 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-emerald-500/10 to-transparent">
                    <form onSubmit={handleCreatePortfolio} className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="New portfolio name"
                          value={newPortfolioName}
                          onChange={(e) => setNewPortfolioName(e.target.value)}
                          className="h-9 text-sm bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 focus:border-emerald-500/50"
                        />
                        <select
                          className="h-9 px-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/5 text-sm focus:border-emerald-500/50 focus:outline-none"
                          value={newPortfolioCurrency}
                          onChange={(e) => setNewPortfolioCurrency(e.target.value as "USD" | "CAD")}
                        >
                          <option value="USD" className="bg-gray-900">USD</option>
                          <option value="CAD" className="bg-gray-900">CAD</option>
                        </select>
                      </div>
                      <Button type="submit" size="sm" disabled={creatingPortfolio} className="w-full bg-emerald-500 hover:bg-emerald-600">
                        {creatingPortfolio ? "Creating..." : "Create Portfolio"}
                      </Button>
                    </form>
                  </div>
                  <div className="max-h-64 overflow-auto">
                    {portfolios.length === 0 ? (
                      <p className="p-4 text-sm text-black/50 dark:text-white/50 text-center">No portfolios yet</p>
                    ) : (
                      portfolios.map((portfolio) => (
                        <div
                          key={portfolio.id}
                          className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-all ${
                            portfolio.id === selectedPortfolioId
                              ? "bg-gradient-to-r from-emerald-500/20 to-transparent border-l-2 border-emerald-500"
                              : "hover:bg-black/5 dark:hover:bg-white/5"
                          }`}
                          onClick={() => {
                            if (editingPortfolioId !== portfolio.id) {
                              setSelectedPortfolioId(portfolio.id);
                              setShowPortfolioDropdown(false);
                            }
                          }}
                        >
                          {editingPortfolioId === portfolio.id ? (
                            <form
                              className="flex gap-2 flex-1 mr-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleRenamePortfolio(portfolio.id);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Input
                                value={editingPortfolioName}
                                onChange={(e) => setEditingPortfolioName(e.target.value)}
                                className="h-7 text-sm bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    setEditingPortfolioId(null);
                                    setEditingPortfolioName("");
                                  }
                                }}
                              />
                              <Button type="submit" size="sm" className="h-7 px-2 bg-emerald-500 hover:bg-emerald-600">
                                Save
                              </Button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{portfolio.name}</span>
                              <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                                {portfolio.currency}
                              </span>
                            </div>
                          )}
                          {editingPortfolioId !== portfolio.id && (
                            <div className="flex gap-1">
                              <button
                                className="p-1.5 rounded-lg text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingPortfolioId(portfolio.id);
                                  setEditingPortfolioName(portfolio.name);
                                }}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                className="p-1.5 rounded-lg text-black/40 dark:text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePortfolio(portfolio.id);
                                }}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {activeTab === "watchlist" && selectedWatchlistId && (
            <AddSymbolForm
              watchlistId={selectedWatchlistId}
              onSymbolAdded={() => fetchWatchlistItems(selectedWatchlistId)}
              compact
            />
          )}
        </div>

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
                          <h2 className="font-semibold text-black dark:text-white">Watchlist: {selectedWatchlist?.name}</h2>
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
          <div className="space-y-6">
            {selectedPortfolioId && selectedPortfolio ? (
              <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-emerald-500/10 to-transparent">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="font-semibold text-black dark:text-white">Portfolio: {selectedPortfolio.name}</h2>
                      <p className="text-xs text-black/50 dark:text-white/50">{selectedPortfolio.currency} • Created {new Date(selectedPortfolio.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <Button asChild className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600">
                    <Link href={`/portfolio/${selectedPortfolioId}`}>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Open Portfolio
                    </Link>
                  </Button>
                </div>
                <div className="p-8 text-center">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                    <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-black dark:text-white mb-2">{selectedPortfolio.name}</h3>
                  <p className="text-black/50 dark:text-white/50 mb-6">Click &quot;Open Portfolio&quot; to view holdings, add positions, and see detailed analytics.</p>
                  <Button asChild size="lg" className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600">
                    <Link href={`/portfolio/${selectedPortfolioId}`}>
                      View Full Portfolio
                      <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </Link>
                  </Button>
                </div>
              </div>
            ) : portfoliosLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                  <p className="text-black/50 dark:text-white/50">Loading portfolios...</p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-12">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-black dark:text-white mb-2">No Portfolio Selected</h3>
                  <p className="text-black/50 dark:text-white/50">Create your first portfolio using the dropdown above.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
