"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { WatchlistItemWithQuote } from "@/types";
import { StockDetailsModal } from "@/components/stocks/stock-details-modal";

type SortColumn = "symbol" | "price" | "1D" | "5D" | "1M" | "3M" | "1Y";
type SortDirection = "asc" | "desc";

interface WatchlistTableProps {
  items: WatchlistItemWithQuote[];
  selectedSymbol?: string;
  onSelectSymbol: (symbol: string) => void;
  onRemoveSymbol: (id: number) => void;
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined) return "-";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getChangeColor(value: number | undefined): string {
  if (value === undefined) return "text-white/50";
  return value >= 0 ? "text-emerald-400" : "text-red-400";
}

function getChangeBg(value: number | undefined): string {
  if (value === undefined) return "bg-white/5";
  return value >= 0 ? "bg-emerald-500/10" : "bg-red-500/10";
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
  selectedSymbol,
  onSelectSymbol,
  onRemoveSymbol,
}: WatchlistTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [detailsSymbol, setDetailsSymbol] = useState<string | null>(null);

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
        <h3 className="text-lg font-semibold text-white mb-2">No Symbols Yet</h3>
        <p className="text-white/50">Add your first symbol using the search above.</p>
      </div>
    );
  }

  const HeaderCell = ({ column, label, align = "right" }: { column: SortColumn; label: string; align?: "left" | "right" }) => (
    <th
      className={`px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider cursor-pointer hover:text-white/80 transition-colors select-none ${align === "left" ? "text-left" : "text-right"}`}
      onClick={() => handleSort(column)}
    >
      {label}
      <SortIcon direction={sortColumn === column ? sortDirection : null} />
    </th>
  );

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <HeaderCell column="symbol" label="Symbol" align="left" />
              <HeaderCell column="price" label="Price" />
              <HeaderCell column="1D" label="1D" />
              <HeaderCell column="5D" label="5D" />
              <HeaderCell column="1M" label="1M" />
              <HeaderCell column="3M" label="3M" />
              <HeaderCell column="1Y" label="1Y" />
              <th className="px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item, index) => (
              <tr
                key={item.id}
                className={`border-b border-white/5 cursor-pointer transition-all hover:bg-white/5 ${
                  selectedSymbol === item.symbol
                    ? "bg-gradient-to-r from-blue-500/10 to-transparent"
                    : ""
                } ${index % 2 === 0 ? "bg-white/[0.02]" : ""}`}
                onClick={() => onSelectSymbol(item.symbol)}
              >
                <td className="px-4 py-4">
                  <button
                    className="flex items-center gap-3 hover:text-blue-400 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailsSymbol(item.symbol);
                    }}
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-blue-400">{item.symbol.slice(0, 2)}</span>
                    </div>
                    <span className="font-semibold text-white">{item.symbol}</span>
                  </button>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono font-semibold text-white">{formatCurrency(item.price)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(item.changePercent)} ${getChangeColor(item.changePercent)}`}>
                    {formatPercent(item.changePercent)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(item.change5D)} ${getChangeColor(item.change5D)}`}>
                    {formatPercent(item.change5D)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(item.change1M)} ${getChangeColor(item.change1M)}`}>
                    {formatPercent(item.change1M)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(item.change3M)} ${getChangeColor(item.change3M)}`}>
                    {formatPercent(item.change3M)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(item.change1Y)} ${getChangeColor(item.change1Y)}`}>
                    {formatPercent(item.change1Y)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white/40 hover:text-red-400 hover:bg-red-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveSymbol(item.id);
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </Button>
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
    </>
  );
}
