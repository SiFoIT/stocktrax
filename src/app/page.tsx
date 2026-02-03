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
      <h1 className="text-3xl font-bold mb-8">StockTrax</h1>

      <Tabs defaultValue="watchlist" className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <div className="relative" ref={dropdownRef}>
              <TabsTrigger
                value="watchlist"
                onClick={() => setShowWatchlistDropdown(!showWatchlistDropdown)}
                className="flex items-center gap-1"
              >
                {selectedWatchlist?.name || "Watchlist"}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </TabsTrigger>

              {showWatchlistDropdown && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-md shadow-lg z-50">
                  <div className="p-2 border-b border-border">
                    <form onSubmit={handleCreateWatchlist} className="flex gap-2">
                      <Input
                        placeholder="New watchlist name"
                        value={newWatchlistName}
                        onChange={(e) => setNewWatchlistName(e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Button type="submit" size="sm" disabled={creatingWatchlist}>
                        Add
                      </Button>
                    </form>
                  </div>
                  <div className="max-h-48 overflow-auto">
                    {watchlists.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">No watchlists yet</p>
                    ) : (
                      watchlists.map((watchlist) => (
                        <div
                          key={watchlist.id}
                          className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-accent/50 ${
                            watchlist.id === selectedWatchlistId ? "bg-accent" : ""
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
                              className="flex gap-1 flex-1 mr-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleRenameWatchlist(watchlist.id);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Input
                                value={editingWatchlistName}
                                onChange={(e) => setEditingWatchlistName(e.target.value)}
                                className="h-6 text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    setEditingWatchlistId(null);
                                    setEditingWatchlistName("");
                                  }
                                }}
                              />
                              <Button type="submit" size="sm" className="h-6 px-2">
                                Save
                              </Button>
                            </form>
                          ) : (
                            <span className="text-sm">{watchlist.name}</span>
                          )}
                          {editingWatchlistId !== watchlist.id && (
                            <div className="flex gap-1">
                              <button
                                className="text-muted-foreground hover:text-foreground p-1"
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
                                className="text-muted-foreground hover:text-destructive p-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteWatchlist(watchlist.id);
                                }}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
            <TabsTrigger value="portfolios">Portfolios</TabsTrigger>
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
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle>Watchlist: {selectedWatchlist?.name}</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={watchlistLoading}
                  >
                    {watchlistLoading ? "Refreshing..." : "Refresh"}
                  </Button>
                </CardHeader>
                <CardContent>
                  {watchlistLoading ? (
                    <p className="text-muted-foreground">Loading watchlist...</p>
                  ) : (
                    <WatchlistTable
                      items={watchlistItems}
                      selectedSymbol={selectedSymbol}
                      onSelectSymbol={handleSelectSymbol}
                      onRemoveSymbol={handleRemoveSymbol}
                    />
                  )}
                </CardContent>
              </Card>

              {selectedSymbol && (
                <Card>
                  <CardHeader>
                    <CardTitle>{selectedSymbol} Price Chart</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PriceChart symbol={selectedSymbol} storageKey={`watchlist_${selectedWatchlistId}`} />
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-8">
                <p className="text-center text-muted-foreground">
                  Create your first watchlist using the dropdown above.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="portfolios" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Create New Portfolio</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreatePortfolio} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1 block">Name</label>
                  <Input
                    placeholder="My Portfolio"
                    value={newPortfolioName}
                    onChange={(e) => setNewPortfolioName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Currency</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors"
                    value={newPortfolioCurrency}
                    onChange={(e) => setNewPortfolioCurrency(e.target.value as "USD" | "CAD")}
                  >
                    <option value="USD">USD</option>
                    <option value="CAD">CAD</option>
                  </select>
                </div>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <h2 className="text-xl font-semibold">Your Portfolios</h2>

          {portfoliosLoading ? (
            <p className="text-muted-foreground">Loading portfolios...</p>
          ) : portfolios.length === 0 ? (
            <p className="text-muted-foreground">
              No portfolios yet. Create your first one above.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {portfolios.map((portfolio) => (
                <Card key={portfolio.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
                          className="h-8"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setEditingPortfolioId(null);
                              setEditingPortfolioName("");
                            }
                          }}
                        />
                        <Button type="submit" size="sm">
                          Save
                        </Button>
                      </form>
                    ) : (
                      <CardTitle className="text-lg">{portfolio.name}</CardTitle>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {portfolio.currency}
                    </span>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      Created{" "}
                      {new Date(portfolio.createdAt).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2">
                      <Button asChild className="flex-1">
                        <Link href={`/portfolio/${portfolio.id}`}>View</Link>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingPortfolioId(portfolio.id);
                          setEditingPortfolioName(portfolio.name);
                        }}
                      >
                        Rename
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleDeletePortfolio(portfolio.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
