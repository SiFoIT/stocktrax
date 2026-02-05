"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { WatchlistItemWithQuote } from "@/types";
import { StockDetailsModal } from "@/components/stocks/stock-details-modal";

type SortColumn = "symbol" | "price" | "dividendRate" | "dividendYield" | "exDividendDate" | "daysToExDiv" | "dividendDate" | "payoutRatio" | "sector" | "fiveYearAvgYield";
type SortDirection = "asc" | "desc";

interface DividendTableProps {
  items: WatchlistItemWithQuote[];
  selectedSymbol?: string;
  onSelectSymbol: (symbol: string) => void;
  onRemoveSymbol: (id: number) => void;
}

function formatCurrency(value: number | undefined, currency = "USD"): string {
  if (value === undefined) return "-";
  const symbol = currency === "CAD" ? "C$" : currency === "USD" ? "US$" : "$";
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function formatPercentRaw(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${value.toFixed(2)}%`;
}

function formatDate(value: string | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDaysToExDiv(exDividendDate: string | undefined): number | undefined {
  if (!exDividendDate) return undefined;
  const exDate = new Date(exDividendDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exDate.setHours(0, 0, 0, 0);
  const diffTime = exDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function formatDaysToExDiv(days: number | undefined): string {
  if (days === undefined) return "-";
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "Today";
  return `${days}d`;
}

function getDaysToExDivColor(days: number | undefined): string {
  if (days === undefined) return "text-black/50 dark:text-white/50";
  if (days < 0) return "text-black/40 dark:text-white/40"; // Past
  if (days <= 7) return "text-amber-400"; // Soon - buy now!
  if (days <= 30) return "text-emerald-400"; // Upcoming
  return "text-black/70 dark:text-white/70"; // Far out
}

function getSafetyScore(payoutRatio: number | undefined): number {
  // Returns 1-3 for sorting (1=safe, 2=moderate, 3=at risk, 4=unknown)
  if (payoutRatio === undefined) return 4;
  if (payoutRatio < 0.5) return 1;
  if (payoutRatio < 0.8) return 2;
  return 3;
}

function getSafetyLabel(payoutRatio: number | undefined): { text: string; color: string; bg: string } {
  if (payoutRatio === undefined) return { text: "-", color: "text-black/50 dark:text-white/50", bg: "" };
  if (payoutRatio < 0.5) return { text: "Safe", color: "text-emerald-400", bg: "bg-emerald-500/10" };
  if (payoutRatio < 0.8) return { text: "Moderate", color: "text-amber-400", bg: "bg-amber-500/10" };
  return { text: "At Risk", color: "text-red-400", bg: "bg-red-500/10" };
}

function getSectorAbbrev(sector: string | undefined): string {
  if (!sector) return "-";
  const abbrevMap: Record<string, string> = {
    "Technology": "Tech",
    "Financial Services": "Finance",
    "Healthcare": "Health",
    "Consumer Cyclical": "Cons Cyc",
    "Consumer Defensive": "Cons Def",
    "Communication Services": "Comms",
    "Industrials": "Indust",
    "Real Estate": "REIT",
    "Basic Materials": "Materials",
    "Energy": "Energy",
    "Utilities": "Utilities",
  };
  return abbrevMap[sector] || sector.slice(0, 8);
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  return (
    <span className={`ml-1 transition-opacity ${direction ? "opacity-100" : "opacity-30"}`}>
      {direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}
    </span>
  );
}

export function DividendTable({
  items,
  selectedSymbol,
  onSelectSymbol,
  onRemoveSymbol,
}: DividendTableProps) {
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
        case "dividendRate":
          aVal = a.dividendRate;
          bVal = b.dividendRate;
          break;
        case "dividendYield":
          aVal = a.dividendYield;
          bVal = b.dividendYield;
          break;
        case "exDividendDate":
          aVal = a.exDividendDate;
          bVal = b.exDividendDate;
          break;
        case "daysToExDiv":
          aVal = getDaysToExDiv(a.exDividendDate);
          bVal = getDaysToExDiv(b.exDividendDate);
          break;
        case "dividendDate":
          aVal = a.dividendDate;
          bVal = b.dividendDate;
          break;
        case "payoutRatio":
          aVal = a.payoutRatio;
          bVal = b.payoutRatio;
          break;
        case "sector":
          aVal = a.sector || "";
          bVal = b.sector || "";
          break;
        case "fiveYearAvgYield":
          aVal = a.fiveYearAvgDividendYield;
          bVal = b.fiveYearAvgDividendYield;
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

  const HeaderCell = ({ column, label, align = "right" }: { column: SortColumn; label: string; align?: "left" | "right" }) => (
    <th
      className={`px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider cursor-pointer hover:text-black dark:hover:text-white/80 transition-colors select-none whitespace-nowrap ${align === "left" ? "text-left" : "text-right"}`}
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
            <tr className="border-b border-black/10 dark:border-white/10">
              <HeaderCell column="symbol" label="Symbol" align="left" />
              <HeaderCell column="sector" label="Sector" align="left" />
              <HeaderCell column="price" label="Price" />
              <HeaderCell column="dividendRate" label="Div Rate" />
              <HeaderCell column="dividendYield" label="Yield" />
              <HeaderCell column="payoutRatio" label="Payout" />
              <HeaderCell column="exDividendDate" label="Ex-Div" />
              <HeaderCell column="daysToExDiv" label="Days" />
              <HeaderCell column="dividendDate" label="Pay Date" />
              <HeaderCell column="fiveYearAvgYield" label="5Y Avg" />
              <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item, index) => (
              <tr
                key={item.id}
                className={`border-b border-white/5 cursor-pointer transition-all hover:bg-black/5 dark:hover:bg-white/5 ${
                  selectedSymbol === item.symbol
                    ? "bg-gradient-to-r from-blue-500/10 to-transparent"
                    : ""
                } ${index % 2 === 0 ? "bg-black/[0.02] dark:bg-white/[0.02]" : ""}`}
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
                    <span className="font-semibold text-black dark:text-white">{item.symbol}</span>
                  </button>
                </td>
                <td className="px-4 py-4">
                  <span className="text-xs text-black/60 dark:text-white/60">{getSectorAbbrev(item.sector)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono font-semibold text-black dark:text-white">{formatCurrency(item.price, item.currency)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono text-black dark:text-white">{formatCurrency(item.dividendRate, item.currency)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${
                    item.dividendYield !== undefined && item.dividendYield > 0
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-black/5 dark:bg-white/5 text-black/50 dark:text-white/50"
                  }`}>
                    {formatPercent(item.dividendYield)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  {(() => {
                    const safety = getSafetyLabel(item.payoutRatio);
                    return (
                      <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${safety.bg} ${safety.color}`}>
                        {formatPercent(item.payoutRatio)}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="text-black/70 dark:text-white/70">{formatDate(item.exDividendDate)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getDaysToExDivColor(getDaysToExDiv(item.exDividendDate))}`}>
                    {formatDaysToExDiv(getDaysToExDiv(item.exDividendDate))}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="text-black/70 dark:text-white/70">{formatDate(item.dividendDate)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="text-black/70 dark:text-white/70">{formatPercentRaw(item.fiveYearAvgDividendYield)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-black/40 dark:text-white/40 hover:text-red-400 hover:bg-red-500/10"
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
