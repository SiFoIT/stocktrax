"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PriceRangeBar } from "@/components/ui/price-range-bar";
import { StockIcon } from "@/components/ui/stock-icon";
import { WatchlistItemWithQuote } from "@/types";
import { StockDetailsModal } from "@/components/stocks/stock-details-modal";
import { PriceChartModal } from "@/components/charts/price-chart-modal";
import { formatCurrency, formatPercent, getChangeColor, getChangeBg, formatTradeTime } from "@/lib/utils";
import { ExtendedHoursLabel } from "@/components/ui/extended-hours-label";

type SortColumn = "symbol" | "price" | "dayRange" | "52wRange" | "1D" | "5D" | "1M" | "3M" | "1Y" | "5Y";
type SortDirection = "asc" | "desc";

interface HeaderCellProps {
  column: SortColumn;
  label: string;
  align?: "left" | "right";
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
}

function HeaderCell({ column, label, align = "right", sortColumn, sortDirection, onSort }: HeaderCellProps) {
  return (
    <th
      className={`px-3 py-3 text-xs font-semibold text-black/50 dark:text-black dark:text-white/50 uppercase tracking-wider cursor-pointer hover:text-black dark:text-white/80 transition-colors select-none ${align === "left" ? "text-left" : "text-right"}`}
      onClick={() => onSort(column)}
    >
      {label}
      <SortIcon direction={sortColumn === column ? sortDirection : null} />
    </th>
  );
}

interface WatchlistTableProps {
  items: WatchlistItemWithQuote[];
  onRemoveSymbol: (id: number) => void;
  storageKey?: string;
  alertStates?: Record<number, { hasRules: boolean; triggered: boolean }>;
  onOpenAlerts?: (symbol: string, id: number) => void;
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  return (
    <span className={`ml-1 transition-opacity ${direction ? "opacity-100" : "opacity-30"}`}>
      {direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}
    </span>
  );
}

export function WatchlistTable({
  items,
  onRemoveSymbol,
  storageKey,
  alertStates,
  onOpenAlerts,
}: WatchlistTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [detailsSymbol, setDetailsSymbol] = useState<string | null>(null);
  const [chartIndex, setChartIndex] = useState<number | null>(null);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const sortedItems = useMemo(() => {
    if (!sortColumn) return items;

    return [...items].sort((a, b) => {
      let aVal: number | string | undefined;
      let bVal: number | string | undefined;

      switch (sortColumn) {
        case "symbol":
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case "price":
          aVal = a.price;
          bVal = b.price;
          break;
        case "dayRange": {
          // Sort by position in day range (0-100%)
          const aRange = a.dayHigh && a.dayLow && a.price ? ((a.price - a.dayLow) / (a.dayHigh - a.dayLow)) * 100 : undefined;
          const bRange = b.dayHigh && b.dayLow && b.price ? ((b.price - b.dayLow) / (b.dayHigh - b.dayLow)) * 100 : undefined;
          aVal = aRange;
          bVal = bRange;
          break;
        }
        case "52wRange": {
          // Sort by position in 52-week range (0-100%)
          const aRange = a.fiftyTwoWeekHigh && a.fiftyTwoWeekLow && a.price ? ((a.price - a.fiftyTwoWeekLow) / (a.fiftyTwoWeekHigh - a.fiftyTwoWeekLow)) * 100 : undefined;
          const bRange = b.fiftyTwoWeekHigh && b.fiftyTwoWeekLow && b.price ? ((b.price - b.fiftyTwoWeekLow) / (b.fiftyTwoWeekHigh - b.fiftyTwoWeekLow)) * 100 : undefined;
          aVal = aRange;
          bVal = bRange;
          break;
        }
        case "1D":
          aVal = a.changePercent;
          bVal = b.changePercent;
          break;
        case "5D":
          aVal = a.change5D;
          bVal = b.change5D;
          break;
        case "1M":
          aVal = a.change1M;
          bVal = b.change1M;
          break;
        case "3M":
          aVal = a.change3M;
          bVal = b.change3M;
          break;
        case "1Y":
          aVal = a.change1Y;
          bVal = b.change1Y;
          break;
        case "5Y":
          aVal = a.change5Y;
          bVal = b.change5Y;
          break;
      }

      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;

      let comparison = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal.localeCompare(bVal);
      } else {
        comparison = (aVal as number) - (bVal as number);
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [items, sortColumn, sortDirection]);

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-black dark:text-white mb-2">No Symbols Yet</h3>
        <p className="text-black/50 dark:text-black dark:text-white/50">Add your first symbol using the search above.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <HeaderCell column="symbol" label="Symbol" align="left" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <HeaderCell column="price" label="Price" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <HeaderCell column="1D" label="Chg %" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <th className="px-3 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-center cursor-pointer hover:text-black dark:hover:text-white/80 transition-colors select-none" onClick={() => handleSort("dayRange")}>
                Day Range
                <SortIcon direction={sortColumn === "dayRange" ? sortDirection : null} />
              </th>
              <th className="px-3 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-center cursor-pointer hover:text-black dark:hover:text-white/80 transition-colors select-none" onClick={() => handleSort("52wRange")}>
                52W Range
                <SortIcon direction={sortColumn === "52wRange" ? sortDirection : null} />
              </th>
              <HeaderCell column="5D" label="5D" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <HeaderCell column="1M" label="1M" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <HeaderCell column="3M" label="3M" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <HeaderCell column="1Y" label="1Y" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <HeaderCell column="5Y" label="5Y" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <th className="px-3 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item, index) => (
              <tr
                key={item.id}
                className={`border-b border-white/5 transition-all hover:bg-black/5 dark:hover:bg-white/5 ${index % 2 === 0 ? "bg-black/[0.02] dark:bg-white/[0.02]" : ""}`}
              >
                <td className="px-3 py-4">
                  <div className="flex items-center gap-3">
                    <StockIcon symbol={item.symbol} />
                    <div className="flex flex-col items-start">
                      <div className="flex items-center gap-1.5">
                        <button
                          className="group/sym"
                          onClick={() => setDetailsSymbol(item.symbol)}
                        >
                          <span className="font-semibold text-blue-400 group-hover/sym:text-blue-300 underline decoration-blue-400/40 group-hover/sym:decoration-blue-300 underline-offset-2 transition-colors">{item.symbol}</span>
                        </button>
                        <button
                          className="text-white/30 hover:text-blue-400 hover:bg-blue-500/20 rounded p-0.5 transition-colors"
                          onClick={() => {
                            const idx = sortedItems.findIndex((i) => i.symbol === item.symbol);
                            setChartIndex(idx >= 0 ? idx : 0);
                          }}
                          title="View chart"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12l4-5 3 3 7-8" />
                          </svg>
                        </button>
                      </div>
                      {item.shortName && (
                        <span className="text-[11px] text-white/40 truncate max-w-[180px]">{item.shortName}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-4 text-right whitespace-nowrap">
                  <div>
                    <span className="font-mono font-semibold text-black dark:text-white">{formatCurrency(item.price, item.currency)}</span>
                    {item.lastTradeTime && (
                      <div className="text-[10px] text-black/40 dark:text-white/40">{formatTradeTime(item.lastTradeTime)}</div>
                    )}
                    {item.extendedHours && (
                      <ExtendedHoursLabel extendedHours={item.extendedHours} currency={item.currency} compact />
                    )}
                  </div>
                </td>
                <td className="px-2 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(item.changePercent)} ${getChangeColor(item.changePercent)}`}>
                    {formatPercent(item.changePercent)}
                  </span>
                </td>
                <td className="px-2 py-4 text-center">
                  {item.dayLow && item.dayHigh && item.price ? (
                    <PriceRangeBar low={item.dayLow} current={item.price} high={item.dayHigh} compact />
                  ) : (
                    <span className="text-black/30 dark:text-white/30">-</span>
                  )}
                </td>
                <td className="px-2 py-4 text-center">
                  {item.fiftyTwoWeekLow && item.fiftyTwoWeekHigh && item.price ? (
                    <PriceRangeBar low={item.fiftyTwoWeekLow} current={item.price} high={item.fiftyTwoWeekHigh} compact showDistance />
                  ) : (
                    <span className="text-black/30 dark:text-white/30">-</span>
                  )}
                </td>
                <td className="px-2 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(item.change5D)} ${getChangeColor(item.change5D)}`}>
                    {formatPercent(item.change5D)}
                  </span>
                </td>
                <td className="px-2 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(item.change1M)} ${getChangeColor(item.change1M)}`}>
                    {formatPercent(item.change1M)}
                  </span>
                </td>
                <td className="px-2 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(item.change3M)} ${getChangeColor(item.change3M)}`}>
                    {formatPercent(item.change3M)}
                  </span>
                </td>
                <td className="px-2 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(item.change1Y)} ${getChangeColor(item.change1Y)}`}>
                    {formatPercent(item.change1Y)}
                  </span>
                </td>
                <td className="px-2 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(item.change5Y)} ${getChangeColor(item.change5Y)}`}>
                    {formatPercent(item.change5Y)}
                  </span>
                </td>
                <td className="pl-2 pr-1 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {onOpenAlerts && (
                      <button
                        className={`p-2 rounded-lg transition-colors ${(() => {
                          const state = alertStates?.[item.id];
                          if (state?.triggered) return "text-red-500 hover:bg-red-500/10";
                          if (state?.hasRules) return "text-emerald-500 hover:bg-emerald-500/10";
                          return "text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5";
                        })()}`}
                        onClick={() => onOpenAlerts(item.symbol, item.id)}
                        aria-label="Manage alerts"
                      >
                        <svg className={`w-4 h-4 ${state?.triggered ? "animate-[bell-ring_2s_ease-in-out_infinite] origin-top" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-black dark:text-black/40 dark:text-white/40 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => onRemoveSymbol(item.id)}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detailsSymbol && (
        <StockDetailsModal
          symbol={detailsSymbol}
          onClose={() => setDetailsSymbol(null)}
        />
      )}

      {chartIndex !== null && (
        <PriceChartModal
          symbols={sortedItems.map((i) => ({ symbol: i.symbol, changePercent: i.changePercent }))}
          initialIndex={chartIndex}
          storageKey={storageKey}
          getTimeframeChanges={(symbol) => {
            const item = items.find((i) => i.symbol === symbol);
            if (!item) return undefined;
            return {
              "1D": item.changePercent,
              "5D": item.change5D,
              "3M": item.change3M,
              "1Y": item.change1Y,
              "5Y": item.change5Y,
            };
          }}
          onClose={() => setChartIndex(null)}
        />
      )}
    </>
  );
}
