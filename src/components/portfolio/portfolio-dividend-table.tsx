"use client";

import { useState, useMemo } from "react";
import { StockIcon } from "@/components/ui/stock-icon";
import { HoldingWithQuote } from "@/types";
import { StockDetailsModal } from "@/components/stocks/stock-details-modal";
import { PriceChartModal } from "@/components/charts/price-chart-modal";
import { formatCurrency, formatPercentRatio, formatDate, toCAD } from "@/lib/utils";
import { formatPercentRaw, getDaysToExDiv, formatDaysToExDiv, getDaysToExDivColor, getSafetyLabel, getSectorAbbrev } from "@/lib/dividend-helpers";

type SortColumn = "symbol" | "shares" | "value" | "dividendRate" | "dividendYield" | "annualIncome" | "exDividendDate" | "daysToExDiv" | "dividendDate" | "payoutRatio" | "sector" | "fiveYearAvgYield";
type SortDirection = "asc" | "desc";

interface PortfolioDividendTableProps {
  holdings: HoldingWithQuote[];
  usdCadRate?: number;
  storageKey?: string;
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  return (
    <span className={`ml-1 transition-opacity ${direction ? "opacity-100" : "opacity-30"}`}>
      {direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}
    </span>
  );
}

export function PortfolioDividendTable({
  holdings,
  usdCadRate = 1,
  storageKey,
}: PortfolioDividendTableProps) {
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

  // Calculate annual income for each holding
  const holdingsWithIncome = useMemo(() => {
    return holdings.map(h => ({
      ...h,
      annualIncome: h.dividendRate ? h.shares * h.dividendRate : undefined,
    }));
  }, [holdings]);

  // Sum in CAD so mixed USD/CAD portfolios total correctly.
  const totalAnnualIncome = holdingsWithIncome.reduce(
    (sum, h) => sum + toCAD(h.annualIncome || 0, h.currency, usdCadRate),
    0
  );

  const sortedHoldings = useMemo(() => {
    if (!sortColumn) return holdingsWithIncome;

    return [...holdingsWithIncome].sort((a, b) => {
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
        case "value":
          aVal = a.marketValue;
          bVal = b.marketValue;
          break;
        case "dividendRate":
          aVal = a.dividendRate;
          bVal = b.dividendRate;
          break;
        case "dividendYield":
          aVal = a.dividendYield;
          bVal = b.dividendYield;
          break;
        case "annualIncome":
          aVal = a.annualIncome;
          bVal = b.annualIncome;
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
  }, [holdingsWithIncome, sortColumn, sortDirection]);

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

  const headerCell = (column: SortColumn, label: string, align: "left" | "right" = "right") => (
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
      {/* Summary */}
      <div className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-emerald-400">Estimated Annual Dividend Income</span>
          </div>
          <span className="text-lg font-bold text-emerald-400">{formatCurrency(totalAnnualIncome, "CAD")}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              {headerCell("symbol", "Symbol", "left")}
              {headerCell("sector", "Sector", "left")}
              {headerCell("shares", "Shares")}
              {headerCell("value", "Value")}
              {headerCell("dividendRate", "Div Rate")}
              {headerCell("dividendYield", "Yield")}
              {headerCell("annualIncome", "Annual $")}
              {headerCell("payoutRatio", "Payout")}
              {headerCell("exDividendDate", "Ex-Div")}
              {headerCell("daysToExDiv", "Days")}
              {headerCell("dividendDate", "Pay Date")}
              {headerCell("fiveYearAvgYield", "5Y Avg")}
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((holding, index) => (
              <tr
                key={holding.id}
                className={`border-b border-white/5 transition-all hover:bg-black/5 dark:hover:bg-white/5 ${index % 2 === 0 ? "bg-black/[0.02] dark:bg-white/[0.02]" : ""}`}
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
                <td className="px-4 py-4">
                  <span className="text-xs text-black/60 dark:text-white/60">{getSectorAbbrev(holding.sector)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono text-black dark:text-white">{holding.shares.toLocaleString()}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono font-semibold text-black dark:text-white">{formatCurrency(holding.marketValue, holding.currency)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono text-black dark:text-white">{formatCurrency(holding.dividendRate, holding.currency)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${
                    holding.dividendYield !== undefined && holding.dividendYield > 0
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-black/5 dark:bg-white/5 text-black/50 dark:text-white/50"
                  }`}>
                    {formatPercentRatio(holding.dividendYield)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`font-mono font-semibold ${holding.annualIncome ? "text-emerald-400" : "text-black/50 dark:text-white/50"}`}>
                    {formatCurrency(holding.annualIncome, holding.currency)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  {(() => {
                    const safety = getSafetyLabel(holding.payoutRatio);
                    return (
                      <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${safety.bg} ${safety.color}`}>
                        {formatPercentRatio(holding.payoutRatio)}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="text-black/70 dark:text-white/70">{formatDate(holding.exDividendDate)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getDaysToExDivColor(getDaysToExDiv(holding.exDividendDate))}`}>
                    {formatDaysToExDiv(getDaysToExDiv(holding.exDividendDate))}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="text-black/70 dark:text-white/70">{formatDate(holding.dividendDate)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="text-black/70 dark:text-white/70">{formatPercentRaw(holding.fiveYearAvgDividendYield)}</span>
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
