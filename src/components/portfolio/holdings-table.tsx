"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
import { StockIcon } from "@/components/ui/stock-icon";
import { HoldingWithQuote } from "@/types";
import { StockDetailsModal } from "@/components/stocks/stock-details-modal";
import { PriceChartModal } from "@/components/charts/price-chart-modal";
import { formatCurrency, formatPercent, getChangeColor, toCAD } from "@/lib/utils";
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
        <Plus className="size-5 text-subtle-foreground" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No Holdings Yet</h3>
        <p className="text-muted-foreground">Add your first transaction using the form above.</p>
      </div>
    );
  }

  return (
    <>
    <div className="overflow-x-auto relative">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
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
                className={`px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground text-${align} cursor-pointer hover:text-foreground transition-colors select-none`}
                onClick={() => handleSort(col)}
              >
                {label}
                <SortIcon direction={sortColumn === col ? sortDirection : null} />
              </th>
            ))}
            <th className="px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedHoldings.map((holding) => (
            <tr
              key={holding.id}
              className={`border-b border-border transition-colors hover:bg-accent`}
              onContextMenu={(e) => handleContextMenu(e, holding.id)}
            >
              <td className="px-3.5 py-2.5">
                <div className="flex items-center gap-3">
                  <StockIcon symbol={holding.symbol} />
                  <div className="flex flex-col items-start">
                    <div className="flex items-center gap-1.5">
                      <button
                        className="group/sym"
                        onClick={() => setDetailsSymbol(holding.symbol)}
                      >
                        <span className="text-[13px] font-semibold text-foreground transition-colors group-hover/sym:text-primary">{holding.symbol}</span>
                      </button>
                      <button
                        className="text-subtle-foreground hover:text-primary hover:bg-primary/20 rounded p-0.5 transition-colors"
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
                      <span className="text-[11px] text-subtle-foreground truncate max-w-[180px]">{holding.shortName}</span>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-3.5 py-2.5 text-right">
                <span className="font-mono text-foreground">{holding.shares.toLocaleString()}</span>
              </td>
              <td className="px-3.5 py-2.5 text-right">
                <span className="font-mono text-foreground/80">{formatCurrency(holding.avgCost, holding.currency)}</span>
              </td>
              <td className="px-3.5 py-2.5 text-right">
                <span className="font-mono font-semibold text-foreground">{formatCurrency(holding.currentPrice, holding.currency)}</span>
                {holding.extendedHours && (
                  <ExtendedHoursLabel extendedHours={holding.extendedHours} currency={holding.currency} compact />
                )}
              </td>
              <td className="px-3.5 py-2.5 text-right">
                {holding.change !== undefined && (
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={`font-mono text-[12.5px] ${getChangeColor(holding.change)}`}>
                      {formatCurrency(holding.change * holding.shares, holding.currency)}
                    </span>
                    <span className={`text-xs ${getChangeColor(holding.changePercent)}`}>
                      {formatPercent(holding.changePercent)}
                    </span>
                  </div>
                )}
              </td>
              <td className="px-3.5 py-2.5 text-right">
                <span className="font-mono font-semibold text-foreground">{formatCurrency(holding.marketValue, holding.currency)}</span>
              </td>
              <td className="px-3.5 py-2.5 text-right">
                {holding.marketValue !== undefined && totalPortfolioValue > 0 && (
                  <span className="font-mono text-foreground/80">
                    {((toCAD(holding.marketValue, holding.currency, usdCadRate) / totalPortfolioValue) * 100).toFixed(1)}%
                  </span>
                )}
              </td>
              <td className="px-3.5 py-2.5 text-right">
                {holding.gainLoss !== undefined && (
                  <div className="flex flex-col items-end gap-1">
                    <span className={`font-mono text-[12.5px] ${getChangeColor(holding.gainLoss)}`}>
                      {formatCurrency(holding.gainLoss, holding.currency)}
                    </span>
                    <span className={`text-xs ${getChangeColor(holding.gainLossPercent)}`}>
                      {formatPercent(holding.gainLossPercent)}
                    </span>
                  </div>
                )}
              </td>
              <td className="px-3.5 py-2.5 text-right">
                <div className="flex items-center justify-end gap-1">
                  {onOpenAlerts && (
                    <button
                      className={`p-2 rounded-lg transition-colors ${(() => {
                        const state = alertStates?.[holding.id];
                        if (state?.triggered) return "text-negative hover:bg-negative/10";
                        if (state?.hasRules) return "text-positive hover:bg-positive/10";
                        return "text-subtle-foreground hover:text-foreground hover:bg-accent";
                      })()}`}
                      onClick={() => onOpenAlerts(holding.symbol, holding.id)}
                      aria-label="Manage alerts"
                    >
                      <Bell className={`size-4 ${alertStates?.[holding.id]?.triggered ? "animate-[bell-ring_2s_ease-in-out_infinite] origin-top" : ""}`} />
                    </button>
                  )}
                  <button
                    className="text-subtle-foreground hover:text-negative hover:bg-negative/10 p-2 rounded-lg transition-colors"
                    onClick={() => onDeleteHolding(holding.id)}
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
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
          className="fixed z-50 min-w-[140px] rounded-md bg-popover border border-border overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {onAddTransaction && (
            <button
              className="w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-accent flex items-center gap-3 transition-colors"
              onClick={() => {
                const holding = holdings.find((h) => h.id === contextMenu.holdingId);
                if (holding) onAddTransaction(holding.symbol);
                setContextMenu(null);
              }}
            >
              <Plus className="size-4 text-muted-foreground" />
              Add Transaction
            </button>
          )}
          <button
            className="w-full px-4 py-2.5 text-left text-sm text-negative hover:bg-negative/10 flex items-center gap-3 transition-colors"
            onClick={() => {
              onDeleteHolding(contextMenu.holdingId);
              setContextMenu(null);
            }}
          >
            <Trash2 className="size-4" />
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
