"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { StockIcon } from "@/components/ui/stock-icon";
import { HoldingWithQuote } from "@/types";
import { StockDetailsModal } from "@/components/stocks/stock-details-modal";
import { PriceChartModal } from "@/components/charts/price-chart-modal";
import { formatCurrency, formatPercent, getChangeColor, getChangeBg, toCAD } from "@/lib/utils";
import { ExtendedHoursLabel } from "@/components/ui/extended-hours-label";

type SortColumn = "symbol" | "shares" | "avgCost" | "price" | "today" | "value" | "port" | "gainLoss";
type SortDirection = "asc" | "desc";

function SortIcon({ direction }: { direction: SortDirection | null }) {
  return (
    <span className={`ml-1 transition-opacity ${direction ? "opacity-100" : "opacity-30"}`}>
      {direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}
    </span>
  );
}

interface HoldingsTableProps {
  holdings: HoldingWithQuote[];
  /** Securities-only total in CAD, used as the % Port denominator. */
  totalPortfolioValue: number;
  /** USD→CAD rate for converting each holding's native market value. */
  usdCadRate?: number;
  onDeleteHolding: (id: number) => void;
  onAddTransaction?: (symbol: string) => void;
  storageKey?: string;
  alertStates?: Record<number, { hasRules: boolean; triggered: boolean }>;
  onOpenAlerts?: (symbol: string, id: number) => void;
}

interface ContextMenu {
  x: number;
  y: number;
  holdingId: number;
}

export function HoldingsTable({
  holdings,
  totalPortfolioValue,
  usdCadRate = 1,
  onDeleteHolding,
  onAddTransaction,
  storageKey,
  alertStates,
  onOpenAlerts,
}: HoldingsTableProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [detailsSymbol, setDetailsSymbol] = useState<string | null>(null);
  const [chartIndex, setChartIndex] = useState<number | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(() => {
    if (!storageKey) return null;
    try {
      const saved = localStorage.getItem(`${storageKey}_sort`);
      if (saved) return JSON.parse(saved).column ?? null;
    } catch {}
    return null;
  });
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    if (!storageKey) return "desc";
    try {
      const saved = localStorage.getItem(`${storageKey}_sort`);
      if (saved) return JSON.parse(saved).direction ?? "desc";
    } catch {}
    return "desc";
  });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const handleSort = (column: SortColumn) => {
    const newDirection = sortColumn === column
      ? (sortDirection === "asc" ? "desc" : "asc")
      : "desc";
    setSortColumn(column);
    setSortDirection(newDirection);
    if (storageKey) {
      localStorage.setItem(`${storageKey}_sort`, JSON.stringify({ column, direction: newDirection }));
    }
  };

  const sortedHoldings = useMemo(() => {
    if (!sortColumn) return holdings;

    return [...holdings].sort((a, b) => {
      let aVal: number | string | undefined;
      let bVal: number | string | undefined;

      switch (sortColumn) {
        case "symbol":
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case "shares":
          aVal = a.shares;
          bVal = b.shares;
          break;
        case "avgCost":
          aVal = a.avgCost;
          bVal = b.avgCost;
          break;
        case "price":
          aVal = a.currentPrice;
          bVal = b.currentPrice;
          break;
        case "today":
          aVal = a.changePercent;
          bVal = b.changePercent;
          break;
        case "value":
          aVal = a.marketValue;
          bVal = b.marketValue;
          break;
        case "port":
          aVal = a.marketValue;
          bVal = b.marketValue;
          break;
        case "gainLoss":
          aVal = a.gainLossPercent;
          bVal = b.gainLossPercent;
          break;
      }

      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      const numA = aVal as number;
      const numB = bVal as number;
      return sortDirection === "asc" ? numA - numB : numB - numA;
    });
  }, [holdings, sortColumn, sortDirection]);

  // Close context menu on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenu(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent, holdingId: number) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      holdingId,
    });
  };

  if (holdings.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-black dark:text-white mb-2">No Holdings Yet</h3>
        <p className="text-black/50 dark:text-white/50">Add your first transaction using the form above.</p>
      </div>
    );
  }

  return (
    <>
    <div className="overflow-x-auto relative">
      <table className="w-full">
        <thead>
          <tr className="border-b border-black/10 dark:border-white/10">
            {([
              ["symbol", "Symbol", "left"],
              ["shares", "Shares", "right"],
              ["avgCost", "Avg Cost", "right"],
              ["price", "Price", "right"],
              ["today", "Today", "right"],
              ["value", "Value", "right"],
              ["port", "% Port", "right"],
              ["gainLoss", "Gain/Loss", "right"],
            ] as const).map(([col, label, align]) => (
              <th
                key={col}
                className={`px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-${align} cursor-pointer hover:text-black/70 dark:hover:text-white/70 transition-colors select-none`}
                onClick={() => handleSort(col)}
              >
                {label}
                <SortIcon direction={sortColumn === col ? sortDirection : null} />
              </th>
            ))}
            <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedHoldings.map((holding, index) => (
            <tr
              key={holding.id}
              className={`border-b border-white/5 transition-all hover:bg-black/5 dark:hover:bg-white/5 ${index % 2 === 0 ? "bg-black/[0.02] dark:bg-white/[0.02]" : ""}`}
              onContextMenu={(e) => handleContextMenu(e, holding.id)}
            >
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <StockIcon symbol={holding.symbol} />
                  <div className="flex flex-col items-start">
                    <div className="flex items-center gap-1.5">
                      <button
                        className="group/sym"
                        onClick={() => setDetailsSymbol(holding.symbol)}
                      >
                        <span className="font-semibold text-blue-400 group-hover/sym:text-blue-300 underline decoration-blue-400/40 group-hover/sym:decoration-blue-300 underline-offset-2 transition-colors">{holding.symbol}</span>
                      </button>
                      <button
                        className="text-white/30 hover:text-blue-400 hover:bg-blue-500/20 rounded p-0.5 transition-colors"
                        onClick={() => {
                          const idx = sortedHoldings.findIndex((h) => h.symbol === holding.symbol);
                          setChartIndex(idx >= 0 ? idx : 0);
                        }}
                        title="View chart"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12l4-5 3 3 7-8" />
                        </svg>
                      </button>
                    </div>
                    {holding.shortName && (
                      <span className="text-[11px] text-white/40 truncate max-w-[180px]">{holding.shortName}</span>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-4 text-right">
                <span className="font-mono text-black dark:text-white">{holding.shares.toLocaleString()}</span>
              </td>
              <td className="px-4 py-4 text-right">
                <span className="font-mono text-black/70 dark:text-white/70">{formatCurrency(holding.avgCost, holding.currency)}</span>
              </td>
              <td className="px-4 py-4 text-right">
                <span className="font-mono font-semibold text-black dark:text-white">{formatCurrency(holding.currentPrice, holding.currency)}</span>
                {holding.extendedHours && (
                  <ExtendedHoursLabel extendedHours={holding.extendedHours} currency={holding.currency} compact />
                )}
              </td>
              <td className="px-4 py-4 text-right">
                {holding.change !== undefined && (
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={`inline-block px-2 py-0.5 rounded-md text-sm font-medium ${getChangeBg(holding.change)} ${getChangeColor(holding.change)}`}>
                      {formatCurrency(holding.change * holding.shares, holding.currency)}
                    </span>
                    <span className={`text-xs ${getChangeColor(holding.changePercent)}`}>
                      {formatPercent(holding.changePercent)}
                    </span>
                  </div>
                )}
              </td>
              <td className="px-4 py-4 text-right">
                <span className="font-mono font-semibold text-black dark:text-white">{formatCurrency(holding.marketValue, holding.currency)}</span>
              </td>
              <td className="px-4 py-4 text-right">
                {holding.marketValue !== undefined && totalPortfolioValue > 0 && (
                  <span className="font-mono text-black/70 dark:text-white/70">
                    {((toCAD(holding.marketValue, holding.currency, usdCadRate) / totalPortfolioValue) * 100).toFixed(1)}%
                  </span>
                )}
              </td>
              <td className="px-4 py-4 text-right">
                {holding.gainLoss !== undefined && (
                  <div className="flex flex-col items-end gap-1">
                    <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(holding.gainLoss)} ${getChangeColor(holding.gainLoss)}`}>
                      {formatCurrency(holding.gainLoss, holding.currency)}
                    </span>
                    <span className={`text-xs ${getChangeColor(holding.gainLossPercent)}`}>
                      {formatPercent(holding.gainLossPercent)}
                    </span>
                  </div>
                )}
              </td>
              <td className="px-4 py-4 text-right">
                <div className="flex items-center justify-end gap-1">
                  {onOpenAlerts && (
                    <button
                      className={`p-2 rounded-lg transition-colors ${(() => {
                        const state = alertStates?.[holding.id];
                        if (state?.triggered) return "text-red-500 hover:bg-red-500/10";
                        if (state?.hasRules) return "text-emerald-500 hover:bg-emerald-500/10";
                        return "text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5";
                      })()}`}
                      onClick={() => onOpenAlerts(holding.symbol, holding.id)}
                      aria-label="Manage alerts"
                    >
                      <svg className={`w-4 h-4 ${alertStates?.[holding.id]?.triggered ? "animate-[bell-ring_2s_ease-in-out_infinite] origin-top" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </button>
                  )}
                  <button
                    className="text-black/40 dark:text-white/40 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-all"
                    onClick={() => onDeleteHolding(holding.id)}
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[140px] rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 shadow-xl overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {onAddTransaction && (
            <button
              className="w-full px-4 py-2.5 text-left text-sm text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-3 transition-colors"
              onClick={() => {
                const holding = holdings.find((h) => h.id === contextMenu.holdingId);
                if (holding) onAddTransaction(holding.symbol);
                setContextMenu(null);
              }}
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Transaction
            </button>
          )}
          <button
            className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-3 transition-colors"
            onClick={() => {
              onDeleteHolding(contextMenu.holdingId);
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>

      {detailsSymbol && (
        <StockDetailsModal
          symbol={detailsSymbol}
          onClose={() => setDetailsSymbol(null)}
        />
      )}

      {chartIndex !== null && (
        <PriceChartModal
          symbols={sortedHoldings.map((h) => ({ symbol: h.symbol, changePercent: h.changePercent }))}
          initialIndex={chartIndex}
          storageKey={storageKey}
          getTimeframeChanges={(symbol) => {
            const h = holdings.find((h) => h.symbol === symbol);
            if (!h) return undefined;
            return {
              "1D": h.changePercent,
              "5D": h.change5D,
              "3M": h.change3M,
              "1Y": h.change1Y,
              "5Y": h.change5Y,
            };
          }}
          onClose={() => setChartIndex(null)}
        />
      )}
    </>
  );
}
