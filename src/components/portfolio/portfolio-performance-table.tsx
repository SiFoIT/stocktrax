"use client";

import { useState, useMemo } from "react";
import { PriceRangeBar } from "@/components/ui/price-range-bar";
import { StockIcon } from "@/components/ui/stock-icon";
import { HoldingWithQuote } from "@/types";
import { StockDetailsModal } from "@/components/stocks/stock-details-modal";

type SortColumn = "symbol" | "price" | "dayRange" | "52wRange" | "1D" | "5D" | "1M" | "3M" | "1Y" | "5Y" | "volume" | "value";
type SortDirection = "asc" | "desc";

interface PortfolioPerformanceTableProps {
  holdings: HoldingWithQuote[];
  selectedSymbol?: string;
  onSelectSymbol: (symbol: string) => void;
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
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getChangeColor(value: number | undefined): string {
  if (value === undefined) return "text-black/50 dark:text-white/50";
  return value >= 0 ? "text-emerald-400" : "text-red-400";
}

function getChangeBg(value: number | undefined): string {
  if (value === undefined) return "bg-black/5 dark:bg-white/5";
  return value >= 0 ? "bg-emerald-500/10" : "bg-red-500/10";
}

function formatTradeTime(isoString: string | undefined): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatVolume(value: number | undefined): string {
  if (value === undefined) return "-";
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  return (
    <span className={`ml-1 transition-opacity ${direction ? "opacity-100" : "opacity-30"}`}>
      {direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}
    </span>
  );
}

export function PortfolioPerformanceTable({
  holdings,
  selectedSymbol,
  onSelectSymbol,
}: PortfolioPerformanceTableProps) {
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
        case "price":
          aVal = a.currentPrice;
          bVal = b.currentPrice;
          break;
        case "value":
          aVal = a.marketValue;
          bVal = b.marketValue;
          break;
        case "dayRange": {
          const aRange = a.dayHigh && a.dayLow && a.currentPrice ? ((a.currentPrice - a.dayLow) / (a.dayHigh - a.dayLow)) * 100 : undefined;
          const bRange = b.dayHigh && b.dayLow && b.currentPrice ? ((b.currentPrice - b.dayLow) / (b.dayHigh - b.dayLow)) * 100 : undefined;
          aVal = aRange;
          bVal = bRange;
          break;
        }
        case "52wRange": {
          const aRange = a.fiftyTwoWeekHigh && a.fiftyTwoWeekLow && a.currentPrice ? ((a.currentPrice - a.fiftyTwoWeekLow) / (a.fiftyTwoWeekHigh - a.fiftyTwoWeekLow)) * 100 : undefined;
          const bRange = b.fiftyTwoWeekHigh && b.fiftyTwoWeekLow && b.currentPrice ? ((b.currentPrice - b.fiftyTwoWeekLow) / (b.fiftyTwoWeekHigh - b.fiftyTwoWeekLow)) * 100 : undefined;
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
        case "volume":
          aVal = a.volume;
          bVal = b.volume;
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
  }, [holdings, sortColumn, sortDirection]);

  if (holdings.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-black dark:text-white mb-2">No Holdings Yet</h3>
        <p className="text-black/50 dark:text-white/50">Add your first holding using the form above.</p>
      </div>
    );
  }

  const HeaderCell = ({ column, label, align = "right" }: { column: SortColumn; label: string; align?: "left" | "right" }) => (
    <th
      className={`px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider cursor-pointer hover:text-black dark:hover:text-white/80 transition-colors select-none ${align === "left" ? "text-left" : "text-right"}`}
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
              <HeaderCell column="price" label="Price" />
              <HeaderCell column="value" label="Value" />
              <HeaderCell column="1D" label="Chg %" />
              <HeaderCell column="volume" label="Volume" />
              <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-center cursor-pointer hover:text-black dark:hover:text-white/80 transition-colors select-none" onClick={() => handleSort("dayRange")}>
                Day Range
                <SortIcon direction={sortColumn === "dayRange" ? sortDirection : null} />
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-center cursor-pointer hover:text-black dark:hover:text-white/80 transition-colors select-none" onClick={() => handleSort("52wRange")}>
                52W Range
                <SortIcon direction={sortColumn === "52wRange" ? sortDirection : null} />
              </th>
              <HeaderCell column="5D" label="5D" />
              <HeaderCell column="1M" label="1M" />
              <HeaderCell column="3M" label="3M" />
              <HeaderCell column="1Y" label="1Y" />
              <HeaderCell column="5Y" label="5Y" />
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((holding, index) => (
              <tr
                key={holding.id}
                className={`border-b border-white/5 cursor-pointer transition-all hover:bg-black/5 dark:hover:bg-white/5 ${
                  selectedSymbol === holding.symbol
                    ? "bg-gradient-to-r from-blue-500/10 to-transparent"
                    : ""
                } ${index % 2 === 0 ? "bg-black/[0.02] dark:bg-white/[0.02]" : ""}`}
                onClick={() => onSelectSymbol(holding.symbol)}
              >
                <td className="px-4 py-4">
                  <button
                    className="group/sym relative flex items-center gap-3 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailsSymbol(holding.symbol);
                    }}
                  >
                    <StockIcon symbol={holding.symbol} />
                    <span className="font-semibold text-blue-400 group-hover/sym:text-blue-300 underline decoration-blue-400/40 group-hover/sym:decoration-blue-300 underline-offset-2 transition-colors">{holding.symbol}</span>
                    {holding.shortName && (
                      <span className="pointer-events-none absolute left-0 -top-9 z-50 hidden group-hover/sym:block whitespace-nowrap rounded-lg bg-zinc-800 border border-white/10 px-3 py-1.5 text-xs text-white shadow-xl">
                        {holding.shortName}
                      </span>
                    )}
                  </button>
                </td>
                <td className="px-4 py-4 text-right">
                  <div>
                    <span className="font-mono font-semibold text-black dark:text-white">{formatCurrency(holding.currentPrice, holding.currency)}</span>
                    {holding.lastTradeTime && (
                      <div className="text-[10px] text-black/40 dark:text-white/40">{formatTradeTime(holding.lastTradeTime)}</div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono font-semibold text-black dark:text-white">{formatCurrency(holding.marketValue, holding.currency)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(holding.changePercent)} ${getChangeColor(holding.changePercent)}`}>
                    {formatPercent(holding.changePercent)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono text-sm text-black/70 dark:text-white/70">
                    {formatVolume(holding.volume)}
                  </span>
                </td>
                <td className="px-4 py-4 text-center">
                  {holding.dayLow && holding.dayHigh && holding.currentPrice ? (
                    <PriceRangeBar low={holding.dayLow} current={holding.currentPrice} high={holding.dayHigh} compact />
                  ) : (
                    <span className="text-black/30 dark:text-white/30">-</span>
                  )}
                </td>
                <td className="px-4 py-4 text-center">
                  {holding.fiftyTwoWeekLow && holding.fiftyTwoWeekHigh && holding.currentPrice ? (
                    <PriceRangeBar low={holding.fiftyTwoWeekLow} current={holding.currentPrice} high={holding.fiftyTwoWeekHigh} compact />
                  ) : (
                    <span className="text-black/30 dark:text-white/30">-</span>
                  )}
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(holding.change5D)} ${getChangeColor(holding.change5D)}`}>
                    {formatPercent(holding.change5D)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(holding.change1M)} ${getChangeColor(holding.change1M)}`}>
                    {formatPercent(holding.change1M)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(holding.change3M)} ${getChangeColor(holding.change3M)}`}>
                    {formatPercent(holding.change3M)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(holding.change1Y)} ${getChangeColor(holding.change1Y)}`}>
                    {formatPercent(holding.change1Y)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(holding.change5Y)} ${getChangeColor(holding.change5Y)}`}>
                    {formatPercent(holding.change5Y)}
                  </span>
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
