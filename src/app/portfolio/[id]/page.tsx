"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { AddHoldingForm } from "@/components/portfolio/add-holding-form";
import { PriceChart } from "@/components/charts/price-chart";
import { AllocationChart } from "@/components/charts/allocation-chart";
import { Portfolio, Holding } from "@/lib/db/schema";
import { HoldingWithQuote } from "@/types";

export default function PortfolioPage() {
  const params = useParams();
  const portfolioId = parseInt(params.id as string);

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [holdings, setHoldings] = useState<HoldingWithQuote[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHoldings = useCallback(async () => {
    try {
      const response = await fetch(`/api/holdings?portfolioId=${portfolioId}`);
      const holdingsData: Holding[] = await response.json();

      // Fetch current prices for each holding
      const holdingsWithQuotes: HoldingWithQuote[] = await Promise.all(
        holdingsData.map(async (holding) => {
          try {
            const quoteResponse = await fetch(`/api/stocks/${holding.symbol}`);
            const quoteData = await quoteResponse.json();

            if (quoteData.quote) {
              const currentPrice = quoteData.quote.price;
              const marketValue = holding.shares * currentPrice;
              const costBasis = holding.shares * holding.avgCost;
              const gainLoss = marketValue - costBasis;
              const gainLossPercent = (gainLoss / costBasis) * 100;

              return {
                ...holding,
                currentPrice,
                marketValue,
                gainLoss,
                gainLossPercent,
              };
            }
          } catch (error) {
            console.error(`Error fetching quote for ${holding.symbol}:`, error);
          }

          return holding;
        })
      );

      setHoldings(holdingsWithQuotes);
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

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPortfolio(), fetchHoldings()]);
      setLoading(false);
    };
    loadData();
  }, [fetchPortfolio, fetchHoldings]);

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

  const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.shares * h.avgCost, 0);
  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <p className="text-muted-foreground">Loading portfolio...</p>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="container mx-auto py-8 px-4">
        <p className="text-muted-foreground">Portfolio not found.</p>
        <Button asChild className="mt-4">
          <Link href="/">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-8">
        <Button asChild variant="outline">
          <Link href="/">Back</Link>
        </Button>
        <h1 className="text-3xl font-bold">{portfolio.name}</h1>
        <span className="text-muted-foreground">({portfolio.currency})</span>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Gain/Loss
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                totalGainLoss >= 0 ? "text-green-500" : "text-red-500"
              }`}
            >
              {totalGainLoss >= 0 ? "+" : ""}$
              {totalGainLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <p
              className={`text-sm ${
                totalGainLoss >= 0 ? "text-green-500" : "text-red-500"
              }`}
            >
              {totalGainLoss >= 0 ? "+" : ""}
              {totalGainLossPercent.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Holdings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{holdings.length}</p>
          </CardContent>
        </Card>
      </div>

      <AddHoldingForm portfolioId={portfolioId} onHoldingAdded={fetchHoldings} />

      <div className="mt-8">
        <Tabs defaultValue="holdings">
          <TabsList>
            <TabsTrigger value="holdings">Holdings</TabsTrigger>
            <TabsTrigger value="allocation">Allocation</TabsTrigger>
          </TabsList>
          <TabsContent value="holdings" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <HoldingsTable
                  holdings={holdings}
                  selectedSymbol={selectedSymbol || undefined}
                  onSelectHolding={handleSelectHolding}
                  onDeleteHolding={handleDeleteHolding}
                />
              </CardContent>
            </Card>

            {selectedSymbol && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>{selectedSymbol} Price Chart</CardTitle>
                </CardHeader>
                <CardContent>
                  <PriceChart symbol={selectedSymbol} storageKey={`portfolio_${portfolioId}`} />
                </CardContent>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="allocation" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Portfolio Allocation</CardTitle>
              </CardHeader>
              <CardContent>
                <AllocationChart holdings={holdings} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
