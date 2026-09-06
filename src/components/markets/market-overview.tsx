"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Category, CATEGORIES, CATEGORY_LABELS, HEADLINE_SYMBOLS } from "@/lib/markets/symbols";
import {
  MarketData,
  AlertRuleDTO,
  AlertHistoryEntry,
  WatchlistItemWithQuote,
  TriggeredAlertSummary,
} from "@/types";
import { Loader2 } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { MarketCard } from "./market-card";
import { MarketTable } from "./market-table";
import { MarketGlance } from "./market-glance";
import { MarketStatus } from "./market-status";
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

/**
 * Demoted rows read left to right, top to bottom: Markets, Commodities,
 * Currency, Crypto. A plain two-column grid gives exactly that, and keeps each
 * row's section headings on the same line. The cost is slack under the shorter
 * table in a row, since grid rows are as tall as their tallest item.
 */
const DEMOTED_ORDER: Category[] = ["markets", "commodities", "currency", "crypto"];

interface MarketOverviewProps {
  /** Owned by the dashboard, which already fetches it for the Watchlists tab. */
  watchlistItems: WatchlistItemWithQuote[];
  watchlistLoading: boolean;
  watchlistAlerts: TriggeredAlertSummary[];
}

export function MarketOverview({
  watchlistItems,
  watchlistLoading,
  watchlistAlerts,
}: MarketOverviewProps) {
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

  // The four headline indices become cards; everything else becomes rows.
  const headlineCards = useMemo(() => {
    const indices = marketData?.markets ?? [];
    return HEADLINE_SYMBOLS.map((symbol) => indices.find((d) => d.symbol === symbol)).filter(
      (d): d is MarketData => d !== undefined
    );
  }, [marketData]);

  const demotedByCategory = useMemo(() => {
    const headline = new Set<string>(HEADLINE_SYMBOLS);
    const result = {} as MarketDataByCategory;
    for (const category of CATEGORIES) {
      result[category] = (marketData?.[category] ?? []).filter((d) => !headline.has(d.symbol));
    }
    return result;
  }, [marketData]);

  const glanceAlertSymbols = useMemo(() => {
    const symbols = [
      ...marketAlerts.map((alert) => alert.symbol),
      ...watchlistAlerts.map((alert) => alert.symbol),
    ];
    return [...new Set(symbols)];
  }, [marketAlerts, watchlistAlerts]);

  /** Every bell on this page opens the market alerts panel; so does the tile. */
  const handleOpenGlanceAlerts = useCallback(() => {
    setFocusedAlertSymbol(null);
    setAlertsPanelOpen(true);
    loadAlertHistory();
  }, [loadAlertHistory]);

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
      <MarketGlance
        watchlistItems={watchlistItems}
        watchlistLoading={watchlistLoading}
        alertSymbols={glanceAlertSymbols}
        onSelectSymbol={setDetailsSymbol}
        onOpenAlerts={handleOpenGlanceAlerts}
      />

      <Panel>
        <PanelHeader
          title="Markets"
          meta="Indices, commodities, currency & crypto"
          right={<MarketStatus onRefresh={handleRefresh} isLoading={isLoading} updatedAt={updatedAt} />}
        />

        {/* Market Data Sections */}
        <PanelBody className="space-y-7 p-4">
          {isLoading && !marketData ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading market data…
            </div>
          ) : !marketData ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No market data available</p>
            </div>
          ) : (
            <>
              {/* The headline four carry the large price and boxed sparkline. */}
              <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
                {headlineCards.map((data) => (
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

              {/* Everything else as rows, balanced across two columns on wide screens. */}
              <div className="grid grid-cols-1 items-start gap-x-8 gap-y-7 lg:grid-cols-2">
                {DEMOTED_ORDER.map((category) => (
                  <MarketTable
                    key={category}
                    title={CATEGORY_LABELS[category]}
                    items={demotedByCategory[category]}
                    onSelect={setDetailsSymbol}
                    onChartClick={(symbol) => setChartIndex(symbolIndexMap.get(symbol) ?? 0)}
                    alertStates={marketAlertStates}
                    onAlertClick={handleOpenAlerts}
                  />
                ))}
              </div>
            </>
          )}
        </PanelBody>
      </Panel>
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
