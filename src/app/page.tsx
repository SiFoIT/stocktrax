"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Portfolio, Watchlist, WatchlistItem } from "@/lib/db/schema";
import { WatchlistItemWithQuote } from "@/types";
import { AddSymbolForm } from "@/components/watchlist/add-symbol-form";
import { WatchlistTable } from "@/components/watchlist/watchlist-table";
import { PriceChart } from "@/components/charts/price-chart";

export default function Dashboard() {
  // Portfolio state
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [newPortfolioCurrency, setNewPortfolioCurrency] = useState<"USD" | "CAD">("USD");
  const [portfoliosLoading, setPortfoliosLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingPortfolioId, setEditingPortfolioId] = useState<number | null>(null);
  const [editingPortfolioName, setEditingPortfolioName] = useState("");

  // Watchlist state
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<number | null>(null);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItemWithQuote[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState<string | undefined>();

  // Dropdown state
  const [showWatchlistDropdown, setShowWatchlistDropdown] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [creatingWatchlist, setCreatingWatchlist] = useState(false);
  const [editingWatchlistId, setEditingWatchlistId] = useState<number | null>(null);
  const [editingWatchlistName, setEditingWatchlistName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowWatchlistDropdown(false);
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

      // Fetch quotes and historical changes for each item
      const itemsWithQuotes: WatchlistItemWithQuote[] = await Promise.all(
        items.map(async (item) => {
          try {
            const url = refresh
              ? `/api/stocks/${item.symbol}?changes=true&refresh=true`
              : `/api/stocks/${item.symbol}?changes=true`;
            const quoteResponse = await fetch(url);
            if (quoteResponse.ok) {
              const quoteData = await quoteResponse.json();
              return {
                ...item,
                price: quoteData.quote?.price,
                change: quoteData.quote?.change,
                changePercent: quoteData.quote?.changePercent,
                change5D: quoteData.historicalChanges?.change5D,
                change1M: quoteData.historicalChanges?.change1M,
                change3M: quoteData.historicalChanges?.change3M,
                change1Y: quoteData.historicalChanges?.change1Y,
              };
            }
          } catch {
            // Ignore quote fetch errors
          }
          return { ...item };
        })
      );

      setWatchlistItems(itemsWithQuotes);

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

    setCreating(true);
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
        setNewPortfolioName("");
        fetchPortfolios();
      }
    } catch (error) {
      console.error("Error creating portfolio:", error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePortfolio = async (id: number) => {
    if (!confirm("Are you sure you want to delete this portfolio?")) return;

    try {
      await fetch(`/api/portfolios?id=${id}`, { method: "DELETE" });
      fetchPortfolios();
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
      fetchPortfolios();
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

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            StockTrax
          </h1>
        </div>
        <p className="text-white/50 text-sm">Track your investments with real-time data</p>
      </div>

      <Tabs defaultValue="watchlist" className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl">
            <div className="relative" ref={dropdownRef}>
              <TabsTrigger
                value="watchlist"
                onClick={() => setShowWatchlistDropdown(!showWatchlistDropdown)}
                className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500/20 data-[state=active]:to-purple-500/20 data-[state=active]:border-blue-500/30 rounded-lg px-4 py-2 transition-all"
              >
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {selectedWatchlist?.name || "Watchlist"}
                <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </TabsTrigger>

              {showWatchlistDropdown && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-white/10 bg-gradient-to-r from-blue-500/10 to-transparent">
                    <form onSubmit={handleCreateWatchlist} className="flex gap-2">
                      <Input
                        placeholder="New watchlist name"
                        value={newWatchlistName}
                        onChange={(e) => setNewWatchlistName(e.target.value)}
                        className="h-9 text-sm bg-white/5 border-white/10 focus:border-blue-500/50"
                      />
                      <Button type="submit" size="sm" disabled={creatingWatchlist} className="bg-blue-500 hover:bg-blue-600">
                        Add
                      </Button>
                    </form>
                  </div>
                  <div className="max-h-64 overflow-auto">
                    {watchlists.length === 0 ? (
                      <p className="p-4 text-sm text-white/50 text-center">No watchlists yet</p>
                    ) : (
                      watchlists.map((watchlist) => (
                        <div
                          key={watchlist.id}
                          className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-all ${
                            watchlist.id === selectedWatchlistId
                              ? "bg-gradient-to-r from-blue-500/20 to-transparent border-l-2 border-blue-500"
                              : "hover:bg-white/5"
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
                                className="h-7 text-sm bg-white/5 border-white/10"
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
                                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
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
                                className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
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
            <TabsTrigger value="portfolios" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500/20 data-[state=active]:to-teal-500/20 data-[state=active]:border-emerald-500/30 rounded-lg px-4 py-2 transition-all">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Portfolios
            </TabsTrigger>
          </TabsList>

          {selectedWatchlistId && (
            <AddSymbolForm
              watchlistId={selectedWatchlistId}
              onSymbolAdded={() => fetchWatchlistItems(selectedWatchlistId)}
              compact
            />
          )}
        </div>

        <TabsContent value="watchlist" className="space-y-6">
          {selectedWatchlistId ? (
            <>
              <div className="rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-blue-500/10 to-transparent">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="font-semibold text-white">Watchlist: {selectedWatchlist?.name}</h2>
                      <p className="text-xs text-white/50">{watchlistItems.length} symbols</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={watchlistLoading}
                    className="bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                  >
                    {watchlistLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                <div className="p-4">
                  {watchlistLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        <p className="text-white/50">Loading watchlist...</p>
                      </div>
                    </div>
                  ) : (
                    <WatchlistTable
                      items={watchlistItems}
                      selectedSymbol={selectedSymbol}
                      onSelectSymbol={handleSelectSymbol}
                      onRemoveSymbol={handleRemoveSymbol}
                    />
                  )}
                </div>
              </div>

              {selectedSymbol && (
                <div className="rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 overflow-hidden">
                  <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-gradient-to-r from-purple-500/10 to-transparent">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                      </svg>
                    </div>
                    <h2 className="font-semibold text-white">{selectedSymbol} Price Chart</h2>
                  </div>
                  <div className="p-4">
                    <PriceChart symbol={selectedSymbol} storageKey={`watchlist_${selectedWatchlistId}`} />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 p-12">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No Watchlist Selected</h3>
                <p className="text-white/50">Create your first watchlist using the dropdown above.</p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="portfolios" className="space-y-6">
          {/* Create Portfolio Card */}
          <div className="rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-gradient-to-r from-emerald-500/10 to-transparent">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h2 className="font-semibold text-white">Create New Portfolio</h2>
            </div>
            <div className="p-6">
              <form onSubmit={handleCreatePortfolio} className="flex gap-4 items-end flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-sm font-medium mb-2 block text-white/70">Portfolio Name</label>
                  <Input
                    placeholder="My Portfolio"
                    value={newPortfolioName}
                    onChange={(e) => setNewPortfolioName(e.target.value)}
                    required
                    className="bg-white/5 border-white/10 focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block text-white/70">Currency</label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors focus:border-emerald-500/50 focus:outline-none"
                    value={newPortfolioCurrency}
                    onChange={(e) => setNewPortfolioCurrency(e.target.value as "USD" | "CAD")}
                  >
                    <option value="USD" className="bg-gray-900">USD</option>
                    <option value="CAD" className="bg-gray-900">CAD</option>
                  </select>
                </div>
                <Button type="submit" disabled={creating} className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600">
                  {creating ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Create Portfolio
                    </div>
                  )}
                </Button>
              </form>
            </div>
          </div>

          {/* Portfolios Header */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white">Your Portfolios</h2>
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-medium">
              {portfolios.length}
            </span>
          </div>

          {portfoliosLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                <p className="text-white/50">Loading portfolios...</p>
              </div>
            </div>
          ) : portfolios.length === 0 ? (
            <div className="rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 p-12">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No Portfolios Yet</h3>
                <p className="text-white/50">Create your first portfolio using the form above.</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {portfolios.map((portfolio) => (
                <div key={portfolio.id} className="group rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 overflow-hidden hover:border-emerald-500/30 transition-all">
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      {editingPortfolioId === portfolio.id ? (
                        <form
                          className="flex gap-2 flex-1 mr-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleRenamePortfolio(portfolio.id);
                          }}
                        >
                          <Input
                            value={editingPortfolioName}
                            onChange={(e) => setEditingPortfolioName(e.target.value)}
                            className="h-9 bg-white/5 border-white/10"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setEditingPortfolioId(null);
                                setEditingPortfolioName("");
                              }
                            }}
                          />
                          <Button type="submit" size="sm" className="bg-emerald-500 hover:bg-emerald-600">
                            Save
                          </Button>
                        </form>
                      ) : (
                        <>
                          <div>
                            <h3 className="font-semibold text-white text-lg">{portfolio.name}</h3>
                            <p className="text-xs text-white/50">
                              Created {new Date(portfolio.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm font-medium">
                            {portfolio.currency}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button asChild className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600">
                        <Link href={`/portfolio/${portfolio.id}`}>
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          View
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setEditingPortfolioId(portfolio.id);
                          setEditingPortfolioName(portfolio.name);
                        }}
                        className="bg-white/5 border-white/10 hover:bg-white/10"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDeletePortfolio(portfolio.id)}
                        className="bg-white/5 border-white/10 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
