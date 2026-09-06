"use client";

import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { PriceRangeBar } from "@/components/ui/price-range-bar";
import { StockIcon } from "@/components/ui/stock-icon";
import { HoldingWithQuote } from "@/types";
import { StockDetailsModal } from "@/components/stocks/stock-details-modal";
import { PriceChartModal } from "@/components/charts/price-chart-modal";
import { formatCurrency, formatPercent, getChangeColor, formatTradeTime, formatVolume } from "@/lib/utils";

type SortColumn = "symbol" | "price" | "dayRange" | "52wRange" | "1D" | "5D" | "1M" | "3M" | "1Y" | "5Y" | "volume" | "value";
type SortDirection = "asc" | "desc";

interface PortfolioPerformanceTableProps {
  holdings: HoldingWithQuote[];
  storageKey?: string;
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
  storageKey,
}: PortfolioPerformanceTableProps) {
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
          const aRange = a.dayHigh && a.dayLow && a.currentPrice && a.dayHigh > a.dayLow ? ((a.currentPrice - a.dayLow) / (a.dayHigh - a.dayLow)) * 100 : undefined;
          const bRange = b.dayHigh && b.dayLow && b.currentPrice && b.dayHigh > b.dayLow ? ((b.currentPrice - b.dayLow) / (b.dayHigh - b.dayLow)) * 100 : undefined;
          aVal = aRange;
          bVal = bRange;
          break;
        }
        case "52wRange": {
          const aRange = a.fiftyTwoWeekHigh && a.fiftyTwoWeekLow && a.currentPrice && a.fiftyTwoWeekHigh > a.fiftyTwoWeekLow ? ((a.currentPrice - a.fiftyTwoWeekLow) / (a.fiftyTwoWeekHigh - a.fiftyTwoWeekLow)) * 100 : undefined;
          const bRange = b.fiftyTwoWeekHigh && b.fiftyTwoWeekLow && b.currentPrice && b.fiftyTwoWeekHigh > b.fiftyTwoWeekLow ? ((b.currentPrice - b.fiftyTwoWeekLow) / (b.fiftyTwoWeekHigh - b.fiftyTwoWeekLow)) * 100 : undefined;
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
        <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-primary/20 flex items-center justify-center">
          <Plus className="size-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No Holdings Yet</h3>
        <p className="text-muted-foreground">Add your first holding using the form above.</p>
      </div>
    );
  }

  const headerCell = (column: SortColumn, label: string, align: "left" | "right" = "right") => (
    <th
      className={`px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none ${align === "left" ? "text-left" : "text-right"}`}
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
            <tr className="border-b border-border">
              {headerCell("symbol", "Symbol", "left")}
              {headerCell("price", "Price")}
              {headerCell("value", "Value")}
              {headerCell("1D", "Chg %")}
              {headerCell("volume", "Volume")}
              <th className="px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground text-center cursor-pointer hover:text-foreground transition-colors select-none" onClick={() => handleSort("dayRange")}>
                Day Range
                <SortIcon direction={sortColumn === "dayRange" ? sortDirection : null} />
              </th>
              <th className="px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground text-center cursor-pointer hover:text-foreground transition-colors select-none" onClick={() => handleSort("52wRange")}>
                52W Range
                <SortIcon direction={sortColumn === "52wRange" ? sortDirection : null} />
              </th>
              {headerCell("5D", "5D")}
              {headerCell("1M", "1M")}
              {headerCell("3M", "3M")}
              {headerCell("1Y", "1Y")}
              {headerCell("5Y", "5Y")}
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((holding) => (
              <tr
                key={holding.id}
                className={`border-b border-border transition-colors hover:bg-accent`}
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
                  <div>
                    <span className="font-mono font-semibold text-foreground">{formatCurrency(holding.currentPrice, holding.currency)}</span>
                    {holding.lastTradeTime && (
                      <div className="text-[10px] text-subtle-foreground">{formatTradeTime(holding.lastTradeTime)}</div>
                    )}
                  </div>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className="font-mono font-semibold text-foreground">{formatCurrency(holding.marketValue, holding.currency)}</span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className={`font-mono text-[12.5px] ${getChangeColor(holding.changePercent)}`}>
                    {formatPercent(holding.changePercent)}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className="font-mono text-sm text-foreground/80">
                    {formatVolume(holding.volume)}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-center">
                  {holding.dayLow && holding.dayHigh && holding.currentPrice ? (
                    <PriceRangeBar low={holding.dayLow} current={holding.currentPrice} high={holding.dayHigh} compact />
                  ) : (
                    <span className="text-subtle-foreground">-</span>
                  )}
                </td>
                <td className="px-3.5 py-2.5 text-center">
                  {holding.fiftyTwoWeekLow && holding.fiftyTwoWeekHigh && holding.currentPrice ? (
                    <PriceRangeBar low={holding.fiftyTwoWeekLow} current={holding.currentPrice} high={holding.fiftyTwoWeekHigh} compact showDistance />
                  ) : (
                    <span className="text-subtle-foreground">-</span>
                  )}
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className={`font-mono text-[12.5px] ${getChangeColor(holding.change5D)}`}>
                    {formatPercent(holding.change5D)}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className={`font-mono text-[12.5px] ${getChangeColor(holding.change1M)}`}>
                    {formatPercent(holding.change1M)}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className={`font-mono text-[12.5px] ${getChangeColor(holding.change3M)}`}>
                    {formatPercent(holding.change3M)}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className={`font-mono text-[12.5px] ${getChangeColor(holding.change1Y)}`}>
                    {formatPercent(holding.change1Y)}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className={`font-mono text-[12.5px] ${getChangeColor(holding.change5Y)}`}>
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
