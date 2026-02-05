"use client";

import { useState, useEffect, useCallback } from "react";
import { Category, CATEGORIES, CATEGORY_LABELS } from "@/lib/markets/symbols";
import { MarketData } from "@/types";
import { MarketCard } from "./market-card";
import { MarketStatus, MarketStatusIndicator } from "./market-status";

type MarketDataByCategory = Record<Category, MarketData[]>;

export function MarketOverview() {
  const [marketData, setMarketData] = useState<MarketDataByCategory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetchMarketData = useCallback(async (refresh = false) => {
    setIsLoading(true);
    try {
      const url = refresh ? `/api/markets?refresh=true` : `/api/markets`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setMarketData(data);
        setUpdatedAt(new Date());
      }
    } catch (error) {
      console.error("Error fetching market data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarketData();
  }, [fetchMarketData]);

  const handleRefresh = () => {
    fetchMarketData(true);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-amber-500/10 to-transparent">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-black dark:text-white">Market Overview</h2>
                <p className="text-xs text-black/50 dark:text-white/50">Global indices, commodities, currency & crypto</p>
              </div>
            </div>
            <MarketStatusIndicator />
          </div>
          <MarketStatus onRefresh={handleRefresh} isLoading={isLoading} updatedAt={updatedAt} />
        </div>

        {/* Market Data Sections */}
        <div className="p-6 space-y-8">
          {isLoading && !marketData ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-black/50 dark:text-white/50">Loading market data...</p>
              </div>
            </div>
          ) : !marketData ? (
            <div className="text-center py-12">
              <p className="text-black/50 dark:text-white/50">No market data available</p>
            </div>
          ) : (
            CATEGORIES.map((category) => (
              <section key={category}>
                <h3 className="text-sm font-semibold text-black/70 dark:text-white/70 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {CATEGORY_LABELS[category]}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {marketData[category]?.map((data) => (
                    <MarketCard key={data.symbol} data={data} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
