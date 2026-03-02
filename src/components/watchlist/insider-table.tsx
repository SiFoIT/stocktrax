"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { StockIcon } from "@/components/ui/stock-icon";
import { WatchlistItemWithQuote } from "@/types";
import { StockDetailsModal } from "@/components/stocks/stock-details-modal";
import { PriceChartModal } from "@/components/charts/price-chart-modal";
import { formatCurrency } from "@/lib/utils";

type SortColumn = "symbol" | "price" | "insidersPercentHeld" | "netBuyCount6mo" | "netSellCount6mo" | "netInsiderShares6mo" | "lastInsiderDate";
type SortDirection = "asc" | "desc";

interface InsiderTableProps {
  items: WatchlistItemWithQuote[];
  onRemoveSymbol: (id: number) => void;
  storageKey?: string;
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  return (
    <span className={`ml-1 transition-opacity ${direction ? "opacity-100" : "opacity-30"}`}>
      {direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}
    </span>
  );
}

function HeaderCell({ column, label, align = "right", sortColumn, sortDirection, onSort }: {
  column: SortColumn;
  label: string;
  align?: "left" | "right";
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
}) {
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider cursor-pointer hover:text-black dark:hover:text-white/80 transition-colors select-none whitespace-nowrap ${align === "left" ? "text-left" : "text-right"}`}
      onClick={() => onSort(column)}
    >
      {label}
      <SortIcon direction={sortColumn === column ? sortDirection : null} />
    </th>
  );
}

function formatInsiderPercent(value: number | undefined): string {
  if (value === undefined || value === null) return "\u2014";
  return `${(value * 100).toFixed(2)}%`;
}

function formatCount(value: number | undefined): string {
  if (value === undefined || value === null) return "\u2014";
  return value.toLocaleString();
}

function formatLastActivity(name?: string, type?: string, date?: string): string {
  if (!name && !type && !date) return "\u2014";
  const parts: string[] = [];
  if (name) {
    // Shorten to last name or first 15 chars
    const short = name.length > 15 ? name.split(" ").pop() || name.slice(0, 15) : name;
    parts.push(short);
  }
  if (type) {
    const shortType = type.includes("Purchase") ? "Purchase" : type.includes("Sale") ? "Sale" : type;
    parts.push(shortType);
  }
  if (date) {
    const d = new Date(date + "T00:00:00");
    parts.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  }
  return parts.join(" \u00B7 ");
}

export function InsiderTable({
  items,
  onRemoveSymbol,
  storageKey,
}: InsiderTableProps) {
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
        case "insidersPercentHeld":
          aVal = a.insidersPercentHeld;
          bVal = b.insidersPercentHeld;
          break;
        case "netBuyCount6mo":
          aVal = a.netBuyCount6mo;
          bVal = b.netBuyCount6mo;
          break;
        case "netSellCount6mo":
          aVal = a.netSellCount6mo;
          bVal = b.netSellCount6mo;
          break;
        case "netInsiderShares6mo":
          aVal = a.netInsiderShares6mo;
          bVal = b.netInsiderShares6mo;
          break;
        case "lastInsiderDate":
          aVal = a.lastInsiderDate;
          bVal = b.lastInsiderDate;
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
        <p className="text-black/50 dark:text-white/50">Add your first symbol using the search above.</p>
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
              <HeaderCell column="insidersPercentHeld" label="Insider %" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <HeaderCell column="netBuyCount6mo" label="Buys (6mo)" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <HeaderCell column="netSellCount6mo" label="Sells (6mo)" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <HeaderCell column="netInsiderShares6mo" label="Net Shares" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <HeaderCell column="lastInsiderDate" label="Last Activity" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item, index) => {
              const netShares = item.netInsiderShares6mo;
              const netColor = netShares === undefined || netShares === null
                ? "text-black/50 dark:text-white/50"
                : netShares > 0
                  ? "text-emerald-400"
                  : netShares < 0
                    ? "text-red-400"
                    : "text-black/50 dark:text-white/50";

              return (
                <tr
                  key={item.id}
                  className={`border-b border-white/5 transition-all hover:bg-black/5 dark:hover:bg-white/5 ${index % 2 === 0 ? "bg-black/[0.02] dark:bg-white/[0.02]" : ""}`}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        className="flex items-center gap-3 hover:text-blue-400 transition-colors"
                        onClick={() => setDetailsSymbol(item.symbol)}
                      >
                        <StockIcon symbol={item.symbol} />
                        <span className="font-semibold text-black dark:text-white">{item.symbol}</span>
                      </button>
                      <button
                        className="text-black/30 dark:text-white/30 hover:text-blue-400 transition-colors p-1 rounded"
                        onClick={() => {
                          const idx = sortedItems.findIndex((i) => i.symbol === item.symbol);
                          setChartIndex(idx >= 0 ? idx : 0);
                        }}
                        title="View chart"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="font-mono font-semibold text-black dark:text-white">{formatCurrency(item.price, item.currency)}</span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-black/70 dark:text-white/70">{formatInsiderPercent(item.insidersPercentHeld)}</span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className={item.netBuyCount6mo ? "text-emerald-400" : "text-black/50 dark:text-white/50"}>
                      {formatCount(item.netBuyCount6mo)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className={item.netSellCount6mo ? "text-red-400" : "text-black/50 dark:text-white/50"}>
                      {formatCount(item.netSellCount6mo)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className={`font-mono font-medium ${netColor}`}>
                      {netShares !== undefined && netShares !== null ? netShares.toLocaleString() : "\u2014"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-xs text-black/60 dark:text-white/60">
                      {formatLastActivity(item.lastInsiderName, item.lastInsiderType, item.lastInsiderDate)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-black/40 dark:text-white/40 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => onRemoveSymbol(item.id)}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </Button>
                  </td>
                </tr>
              );
            })}
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
