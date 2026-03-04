"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Category, CATEGORIES, CATEGORY_LABELS } from "@/lib/markets/symbols";
import { MarketData, AlertRuleDTO, AlertHistoryEntry } from "@/types";
import { MarketCard } from "./market-card";
import { MarketStatus, MarketStatusIndicator } from "./market-status";
import { PriceChartModal } from "@/components/charts/price-chart-modal";
import { StockDetailsModal } from "@/components/stocks/stock-details-modal";
import { AlertsPanel } from "@/components/alerts/alerts-panel";
import {
  triggerMarketAlerts,
  fetchAlertRules,
  fetchAlertHistory,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  resetAlertRule,
  CreateAlertRuleInput,
} from "@/lib/alerts/api";

type MarketDataByCategory = Record<Category, MarketData[]>;

export function MarketOverview() {
  const [marketData, setMarketData] = useState<MarketDataByCategory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [chartIndex, setChartIndex] = useState<number | null>(null);
  const [detailsSymbol, setDetailsSymbol] = useState<string | null>(null);

  // Alert state
  const [marketRules, setMarketRules] = useState<AlertRuleDTO[]>([]);
  const [marketAlerts, setMarketAlerts] = useState<AlertHistoryEntry[]>([]);
  const [marketHistory, setMarketHistory] = useState<AlertHistoryEntry[]>([]);
  const [alertsPanelOpen, setAlertsPanelOpen] = useState(false);
  const [focusedAlertSymbol, setFocusedAlertSymbol] = useState<string | null>(null);

  const loadAlertRules = useCallback(async () => {
    const rules = await fetchAlertRules("market");
    setMarketRules(rules);
  }, []);

  const loadAlertHistory = useCallback(async () => {
    const history = await fetchAlertHistory("market");
    setMarketHistory(history);
  }, []);

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
    } catch {
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarketData();
    loadAlertRules();
  }, [fetchMarketData, loadAlertRules]);

  // Trigger market alerts whenever market data changes
  useEffect(() => {
    if (!marketData) return;
    const allItems = CATEGORIES.flatMap((c) => marketData[c] ?? []);
    if (allItems.length === 0) return;
    triggerMarketAlerts(allItems).then((triggered) => {
      setMarketAlerts(triggered);
      if (triggered.length > 0) {
        loadAlertRules();
        loadAlertHistory();
      }
    });
  }, [marketData, loadAlertRules, loadAlertHistory]);

  const handleRefresh = () => {
    fetchMarketData(true);
  };

  const flatMarketData = useMemo(() => {
    if (!marketData) return [];
    return CATEGORIES.flatMap((category) => marketData[category] ?? []);
  }, [marketData]);

  const flatSymbols = useMemo(() => {
    return flatMarketData.map((d) => ({
      symbol: d.symbol,
      changePercent: d.changePercent,
    }));
  }, [flatMarketData]);

  const symbolIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    flatSymbols.forEach((s, i) => map.set(s.symbol, i));
    return map;
  }, [flatSymbols]);

  // Alert state per symbol
  const marketAlertStates = useMemo(() => {
    const states: Record<string, { hasRules: boolean; triggered: boolean }> = {};
    for (const rule of marketRules) {
      if (!states[rule.symbol]) states[rule.symbol] = { hasRules: false, triggered: false };
      states[rule.symbol].hasRules = true;
      if (rule.needsRecovery || rule.isMuted) {
        states[rule.symbol].triggered = true;
      }
    }
    for (const alert of marketAlerts) {
      if (!states[alert.symbol]) states[alert.symbol] = { hasRules: true, triggered: false };
      states[alert.symbol].triggered = true;
    }
    return states;
  }, [marketRules, marketAlerts]);

  // Source options for AlertsPanel (synthetic IDs from index)
  const marketSourceOptions = useMemo(() => {
    return flatMarketData.map((d, i) => ({
      id: i + 1, // synthetic 1-based ID
      label: d.name,
      symbol: d.symbol,
    }));
  }, [flatMarketData]);

  const handleOpenAlerts = useCallback((symbol: string) => {
    setFocusedAlertSymbol(symbol);
    setAlertsPanelOpen(true);
    loadAlertHistory();
  }, [loadAlertHistory]);

  const handleCreateRule = useCallback(async (input: CreateAlertRuleInput) => {
    await createAlertRule(input);
    await loadAlertRules();
  }, [loadAlertRules]);

  const handleUpdateRule = useCallback(async (id: number, updates: Partial<CreateAlertRuleInput>) => {
    await updateAlertRule(id, updates);
    await loadAlertRules();
  }, [loadAlertRules]);

  const handleDeleteRule = useCallback(async (id: number) => {
    await deleteAlertRule(id);
    await loadAlertRules();
  }, [loadAlertRules]);

  const handleResetRule = useCallback(async (id: number) => {
    await resetAlertRule(id);
    await loadAlertRules();
  }, [loadAlertRules]);

  return (
    <>
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
                    <MarketCard
                      key={data.symbol}
                      data={data}
                      onClick={() => setDetailsSymbol(data.symbol)}
                      onChartClick={() => setChartIndex(symbolIndexMap.get(data.symbol) ?? 0)}
                      alertState={marketAlertStates[data.symbol]}
                      onAlertClick={() => handleOpenAlerts(data.symbol)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
    {detailsSymbol && (
      <StockDetailsModal
        symbol={detailsSymbol}
        onClose={() => setDetailsSymbol(null)}
      />
    )}
    {chartIndex !== null && flatSymbols.length > 0 && (
      <PriceChartModal
        symbols={flatSymbols}
        initialIndex={chartIndex}
        storageKey="market_overview"
        getTimeframeChanges={(symbol) => {
          const item = flatMarketData.find((d) => d.symbol === symbol);
          if (!item) return undefined;
          return {
            "1D": item.changePercent,
          };
        }}
        onClose={() => setChartIndex(null)}
      />
    )}
    <AlertsPanel
      open={alertsPanelOpen}
      scope="market"
      sourceOptions={marketSourceOptions}
      rules={marketRules}
      alerts={marketAlerts}
      history={marketHistory}
      focusSymbol={focusedAlertSymbol}
      onClose={() => { setAlertsPanelOpen(false); setFocusedAlertSymbol(null); }}
      onCreateRule={handleCreateRule}
      onUpdateRule={handleUpdateRule}
      onDeleteRule={handleDeleteRule}
      onResetRule={handleResetRule}
    />
    </>
  );
}
