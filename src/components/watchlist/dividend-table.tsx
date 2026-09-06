"use client";

import { useState, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StockIcon } from "@/components/ui/stock-icon";
import { WatchlistItemWithQuote } from "@/types";
import { StockDetailsModal } from "@/components/stocks/stock-details-modal";
import { PriceChartModal } from "@/components/charts/price-chart-modal";
import { formatCurrency, formatPercentRatio, formatDate } from "@/lib/utils";
import { formatPercentRaw, getDaysToExDiv, formatDaysToExDiv, getDaysToExDivColor, getSafetyLabel, getSectorAbbrev } from "@/lib/dividend-helpers";

type SortColumn = "symbol" | "price" | "dividendRate" | "dividendYield" | "exDividendDate" | "daysToExDiv" | "dividendDate" | "payoutRatio" | "sector" | "fiveYearAvgYield";
type SortDirection = "asc" | "desc";

interface HeaderCellProps {
  column: SortColumn;
  label: string;
  align?: "left" | "right";
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
}

interface DividendTableProps {
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

function DividendHeaderCell({ column, label, align = "right", sortColumn, sortDirection, onSort }: HeaderCellProps) {
  return (
    <th
      className={`px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap ${align === "left" ? "text-left" : "text-right"}`}
      onClick={() => onSort(column)}
    >
      {label}
      <SortIcon direction={sortColumn === column ? sortDirection : null} />
    </th>
  );
}

export function DividendTable({
  items,
  onRemoveSymbol,
  storageKey,
}: DividendTableProps) {
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
        <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-primary/20 flex items-center justify-center">
          <Plus className="size-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No Symbols Yet</h3>
        <p className="text-muted-foreground">Add your first symbol using the search above.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <DividendHeaderCell column="symbol" label="Symbol" align="left" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <DividendHeaderCell column="sector" label="Sector" align="left" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <DividendHeaderCell column="price" label="Price" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <DividendHeaderCell column="dividendRate" label="Div Rate" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <DividendHeaderCell column="dividendYield" label="Yield" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <DividendHeaderCell column="payoutRatio" label="Payout" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <DividendHeaderCell column="exDividendDate" label="Ex-Div" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <DividendHeaderCell column="daysToExDiv" label="Days" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <DividendHeaderCell column="dividendDate" label="Pay Date" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <DividendHeaderCell column="fiveYearAvgYield" label="5Y Avg" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <th className="px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => (
              <tr
                key={item.id}
                className={`border-b border-border transition-colors hover:bg-accent`}
              >
                <td className="px-3.5 py-2.5">
                  <div className="flex items-center gap-3">
                    <StockIcon symbol={item.symbol} />
                    <div className="flex flex-col items-start">
                      <div className="flex items-center gap-1.5">
                        <button
                          className="group/sym"
                          onClick={() => setDetailsSymbol(item.symbol)}
                        >
                          <span className="text-[13px] font-semibold text-foreground transition-colors group-hover/sym:text-primary">{item.symbol}</span>
                        </button>
                        <button
                          className="text-subtle-foreground hover:text-primary hover:bg-primary/20 rounded p-0.5 transition-colors"
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
                        <span className="text-[11px] text-subtle-foreground truncate max-w-[180px]">{item.shortName}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3.5 py-2.5">
                  <span className="text-xs text-muted-foreground">{getSectorAbbrev(item.sector)}</span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className="font-mono font-semibold text-foreground">{formatCurrency(item.price, item.currency)}</span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className="font-mono text-foreground">{formatCurrency(item.dividendRate, item.currency)}</span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${
                    item.dividendYield !== undefined && item.dividendYield > 0
                      ? "bg-positive/10 text-positive"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {formatPercentRatio(item.dividendYield)}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  {(() => {
                    const safety = getSafetyLabel(item.payoutRatio);
                    return (
                      <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${safety.bg} ${safety.color}`}>
                        {formatPercentRatio(item.payoutRatio)}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className="text-foreground/80">{formatDate(item.exDividendDate)}</span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getDaysToExDivColor(getDaysToExDiv(item.exDividendDate))}`}>
                    {formatDaysToExDiv(getDaysToExDiv(item.exDividendDate))}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className="text-foreground/80">{formatDate(item.dividendDate)}</span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <span className="text-foreground/80">{formatPercentRaw(item.fiveYearAvgDividendYield)}</span>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-subtle-foreground hover:text-negative hover:bg-negative/10"
                    onClick={() => onRemoveSymbol(item.id)}
                  >
                    <Trash2 className="size-4" />
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
