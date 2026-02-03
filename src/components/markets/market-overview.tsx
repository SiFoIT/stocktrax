"use client";

import { useState, useEffect, useCallback } from "react";
import { Region, REGION_LABELS } from "@/lib/markets/symbols";
import { MarketData } from "@/types";
import { MarketCard } from "./market-card";
import { MarketStatus, MarketStatusIndicator } from "./market-status";

const REGIONS: Region[] = ["canada", "us", "europe", "asia", "crypto"];

export function MarketOverview() {
  const [activeRegion, setActiveRegion] = useState<Region>("canada");
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetchMarketData = useCallback(async (region: Region, refresh = false) => {
    setIsLoading(true);
    try {
      const url = refresh
        ? `/api/markets?region=${region}&refresh=true`
        : `/api/markets?region=${region}`;
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
    fetchMarketData(activeRegion);
  }, [activeRegion, fetchMarketData]);

  const handleRefresh = () => {
    fetchMarketData(activeRegion, true);
  };

  const handleRegionChange = (region: Region) => {
    setActiveRegion(region);
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
                <p className="text-xs text-black/50 dark:text-white/50">Global indices & crypto</p>
              </div>
            </div>
            <MarketStatusIndicator />
          </div>
          <MarketStatus onRefresh={handleRefresh} isLoading={isLoading} updatedAt={updatedAt} />
        </div>

        {/* Region Tabs */}
        <div className="px-6 pt-4">
          <div className="flex gap-2 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 w-fit">
            {REGIONS.map((region) => (
              <button
                key={region}
                onClick={() => handleRegionChange(region)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeRegion === region
                    ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-black dark:text-white"
                    : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                {REGION_LABELS[region]}
              </button>
            ))}
          </div>
        </div>

        {/* Market Cards Grid */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-black/50 dark:text-white/50">Loading market data...</p>
              </div>
            </div>
          ) : marketData.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-black/50 dark:text-white/50">No market data available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {marketData.map((data) => (
                <MarketCard key={data.symbol} data={data} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
