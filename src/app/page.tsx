"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Portfolio, WatchlistItem } from "@/lib/db/schema";
import { WatchlistItemWithQuote, StockTimeSeries } from "@/types";
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

  // Watchlist state
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItemWithQuote[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState<string | undefined>();
  const [chartData, setChartData] = useState<StockTimeSeries[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

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

  const fetchWatchlist = useCallback(async (refresh = false) => {
    setWatchlistLoading(true);
    try {
      const response = await fetch("/api/watchlist");
      const items: WatchlistItem[] = await response.json();

      // Fetch quotes for each item
      const itemsWithQuotes: WatchlistItemWithQuote[] = await Promise.all(
        items.map(async (item) => {
          try {
            const url = refresh
              ? `/api/stocks/${item.symbol}?refresh=true`
              : `/api/stocks/${item.symbol}`;
            const quoteResponse = await fetch(url);
            if (quoteResponse.ok) {
              const quoteData = await quoteResponse.json();
              return {
                ...item,
                price: quoteData.quote?.price,
                change: quoteData.quote?.change,
                changePercent: quoteData.quote?.changePercent,
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
      if (!selectedSymbol && itemsWithQuotes.length > 0) {
        setSelectedSymbol(itemsWithQuotes[0].symbol);
      }
    } catch (error) {
      console.error("Error fetching watchlist:", error);
    } finally {
      setWatchlistLoading(false);
    }
  }, [selectedSymbol]);

  const fetchChartData = useCallback(async (symbol: string) => {
    setChartLoading(true);
    try {
      const response = await fetch(`/api/stocks/${symbol}?timeseries=true`);
      if (response.ok) {
        const data = await response.json();
        setChartData(data.timeSeries || []);
      }
    } catch (error) {
      console.error("Error fetching chart data:", error);
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolios();
    fetchWatchlist();
  }, [fetchWatchlist]);

  useEffect(() => {
    if (selectedSymbol) {
      fetchChartData(selectedSymbol);
    }
  }, [selectedSymbol, fetchChartData]);

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

  const handleRemoveSymbol = async (id: number) => {
    try {
      await fetch(`/api/watchlist?id=${id}`, { method: "DELETE" });

      // If we're removing the selected symbol, clear selection
      const removedItem = watchlistItems.find((item) => item.id === id);
      if (removedItem?.symbol === selectedSymbol) {
        const remaining = watchlistItems.filter((item) => item.id !== id);
        setSelectedSymbol(remaining.length > 0 ? remaining[0].symbol : undefined);
      }

      fetchWatchlist();
    } catch (error) {
      console.error("Error removing symbol:", error);
    }
  };

  const handleSelectSymbol = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">StockTrax</h1>

      <Tabs defaultValue="watchlist" className="space-y-6">
        <TabsList>
          <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
          <TabsTrigger value="portfolios">Portfolios</TabsTrigger>
        </TabsList>

        <TabsContent value="watchlist" className="space-y-6">
          <AddSymbolForm onSymbolAdded={fetchWatchlist} />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Watchlist</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchWatchlist(true)}
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
                {chartLoading ? (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    Loading chart...
                  </div>
                ) : (
                  <PriceChart data={chartData} />
                )}
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
                    <CardTitle className="text-lg">{portfolio.name}</CardTitle>
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
