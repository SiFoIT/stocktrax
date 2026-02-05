"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { PortfolioPerformanceTable } from "@/components/portfolio/portfolio-performance-table";
import { PortfolioDividendTable } from "@/components/portfolio/portfolio-dividend-table";
import { PortfolioNewsTable } from "@/components/portfolio/portfolio-news-table";
import { AddHoldingForm } from "@/components/portfolio/add-holding-form";
import { PriceChart } from "@/components/charts/price-chart";
import { AllocationChart } from "@/components/charts/allocation-chart";
import { Button } from "@/components/ui/button";
import { MainNav, MainNavTabs } from "@/components/layout/main-nav";
import { Portfolio, Holding } from "@/lib/db/schema";
import { HoldingWithQuote, NewsArticle } from "@/types";

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

export default function PortfolioPage() {
  const params = useParams();
  const portfolioId = parseInt(params.id as string);

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [holdings, setHoldings] = useState<HoldingWithQuote[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"holdings" | "allocation">("holdings");
  const [holdingsView, setHoldingsView] = useState<"holdings" | "performance" | "dividend" | "news">("holdings");
  const [holdingsUpdatedAt, setHoldingsUpdatedAt] = useState<Date | null>(null);
  const [portfolioNews, setPortfolioNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  // State for MainNavTabs (used for dropdown highlighting)
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<number | null>(null);
  const handleNavTabChange = () => {}; // Navigation handled by MainNavTabs internally

  const fetchHoldings = useCallback(async (refresh = false) => {
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
              const gainLossPercent = (gainLoss / costBasis) * 100;

              return {
                ...holding,
                currency: quoteData.quote?.currency || holding.currency,
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
                volume: quoteData.quote?.volume,
                avgVolume: quoteData.quote?.avgVolume,
              };
            }
          } catch (error) {
            console.error(`Error fetching quote for ${holding.symbol}:`, error);
          }

          return holding;
        })
      );

      setHoldings(holdingsWithQuotes);
      setHoldingsUpdatedAt(new Date());
    } catch (error) {
      console.error("Error fetching holdings:", error);
    }
  }, [portfolioId]);

  const fetchPortfolio = useCallback(async () => {
    try {
      const response = await fetch("/api/portfolios");
      const portfolios: Portfolio[] = await response.json();
      const found = portfolios.find((p) => p.id === portfolioId);
      setPortfolio(found || null);
    } catch (error) {
      console.error("Error fetching portfolio:", error);
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
    } catch (error) {
      console.error("Error fetching portfolio news:", error);
    } finally {
      setNewsLoading(false);
    }
  }, [holdings]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPortfolio(), fetchHoldings()]);
      setLoading(false);
    };
    loadData();
  }, [fetchPortfolio, fetchHoldings]);

  useEffect(() => {
    if (holdingsView === "news" && holdings.length > 0) {
      fetchPortfolioNews();
    }
  }, [holdingsView, holdings.length, fetchPortfolioNews]);

  const handleSelectHolding = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  const handleDeleteHolding = async (id: number) => {
    if (!confirm("Are you sure you want to delete this holding?")) return;

    try {
      await fetch(`/api/holdings?id=${id}`, { method: "DELETE" });
      fetchHoldings();
      if (selectedSymbol) {
        const deleted = holdings.find((h) => h.id === id);
        if (deleted?.symbol === selectedSymbol) {
          setSelectedSymbol(null);
        }
      }
    } catch (error) {
      console.error("Error deleting holding:", error);
    }
  };

  const handleEditHolding = async (id: number, shares: number, avgCost: number) => {
    try {
      await fetch(`/api/holdings?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shares, avgCost }),
      });
      fetchHoldings();
    } catch (error) {
      console.error("Error editing holding:", error);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await fetchHoldings(true);
    setLoading(false);
  };

  const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.shares * h.avgCost, 0);
  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

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
      <MainNav />

      {/* Navigation Tabs */}
      <div className="space-y-6">
        <MainNavTabs
          activeTab="portfolios"
          onTabChange={handleNavTabChange}
          selectedWatchlistId={selectedWatchlistId}
          onSelectWatchlist={setSelectedWatchlistId}
          selectedPortfolioId={portfolioId}
          onSelectPortfolio={() => {}}
        />

        {/* Portfolio Title */}
        <div className="flex items-center gap-4">
          <Link
            href="/?tab=portfolios"
            className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-black dark:text-white">{portfolio.name}</h1>
              <span className="text-black/50 dark:text-white/50 text-sm">{portfolio.currency} Portfolio</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-4 mt-8 mb-8">
        <StatCard
          label="Total Value"
          value={`$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
        />
        <StatCard
          label="Total Cost"
          value={`$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
        />
        <StatCard
          label="Total Gain/Loss"
          value={`${totalGainLoss >= 0 ? "+" : ""}$${totalGainLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          subValue={`${totalGainLoss >= 0 ? "+" : ""}${totalGainLossPercent.toFixed(2)}%`}
          colorClass={totalGainLoss >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <StatCard
          label="Holdings"
          value={holdings.length.toString()}
        />
      </div>

      {/* Add Holding Form */}
      <div className="mb-8">
        <AddHoldingForm portfolioId={portfolioId} onHoldingAdded={fetchHoldings} />
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
          onClick={() => setActiveTab("allocation")}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === "allocation"
              ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg"
              : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
          </svg>
          Allocation
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
                    <p className="text-xs text-black/50 dark:text-white/50">{holdings.length} positions</p>
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
                    onClick={() => setHoldingsView("news")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      holdingsView === "news"
                        ? "bg-blue-500 text-white"
                        : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    News
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
              {holdingsView === "holdings" ? (
                <HoldingsTable
                  holdings={holdings}
                  totalPortfolioValue={totalValue}
                  selectedSymbol={selectedSymbol || undefined}
                  onSelectHolding={handleSelectHolding}
                  onDeleteHolding={handleDeleteHolding}
                  onEditHolding={handleEditHolding}
                />
              ) : holdingsView === "performance" ? (
                <PortfolioPerformanceTable
                  holdings={holdings}
                  selectedSymbol={selectedSymbol || undefined}
                  onSelectSymbol={handleSelectHolding}
                />
              ) : holdingsView === "dividend" ? (
                <PortfolioDividendTable
                  holdings={holdings}
                  selectedSymbol={selectedSymbol || undefined}
                  onSelectSymbol={handleSelectHolding}
                />
              ) : (
                <PortfolioNewsTable
                  articles={portfolioNews}
                  loading={newsLoading}
                />
              )}
            </div>
          </div>

          {selectedSymbol && holdingsView !== "news" && (
            <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-purple-500/10 to-transparent">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16" />
                  </svg>
                </div>
                <h2 className="font-semibold text-black dark:text-white">{selectedSymbol} Price Chart</h2>
              </div>
              <div className="p-6">
                <PriceChart
                  symbol={selectedSymbol}
                  storageKey={`portfolio_${portfolioId}`}
                  timeframeChanges={(() => {
                    const holding = holdings.find(h => h.symbol === selectedSymbol);
                    if (!holding) return undefined;
                    return {
                      "1D": holding.changePercent,
                      "5D": holding.change5D,
                      "3M": holding.change3M,
                      "1Y": holding.change1Y,
                      "5Y": holding.change5Y,
                    };
                  })()}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "allocation" && (
        <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-emerald-500/10 to-transparent">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
            </div>
            <h2 className="font-semibold text-black dark:text-white">Portfolio Allocation</h2>
          </div>
          <div className="p-6">
            <AllocationChart holdings={holdings} />
          </div>
        </div>
      )}
    </div>
  );
}
