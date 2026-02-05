"use client";

import { useState, useMemo } from "react";
import { StockIcon } from "@/components/ui/stock-icon";
import { HoldingWithQuote } from "@/types";
import { StockDetailsModal } from "@/components/stocks/stock-details-modal";

type SortColumn = "symbol" | "shares" | "value" | "dividendRate" | "dividendYield" | "annualIncome" | "exDividendDate" | "daysToExDiv" | "dividendDate" | "payoutRatio" | "sector" | "fiveYearAvgYield";
type SortDirection = "asc" | "desc";

interface PortfolioDividendTableProps {
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
  if (days < 0) return "text-black/40 dark:text-white/40";
  if (days <= 7) return "text-amber-400";
  if (days <= 30) return "text-emerald-400";
  return "text-black/70 dark:text-white/70";
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

export function PortfolioDividendTable({
  holdings,
  selectedSymbol,
  onSelectSymbol,
}: PortfolioDividendTableProps) {
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

  // Calculate annual income for each holding
  const holdingsWithIncome = useMemo(() => {
    return holdings.map(h => ({
      ...h,
      annualIncome: h.dividendRate ? h.shares * h.dividendRate : undefined,
    }));
  }, [holdings]);

  const totalAnnualIncome = holdingsWithIncome.reduce((sum, h) => sum + (h.annualIncome || 0), 0);

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
      {/* Summary */}
      <div className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-emerald-400">Estimated Annual Dividend Income</span>
          </div>
          <span className="text-lg font-bold text-emerald-400">{formatCurrency(totalAnnualIncome)}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <HeaderCell column="symbol" label="Symbol" align="left" />
              <HeaderCell column="sector" label="Sector" align="left" />
              <HeaderCell column="shares" label="Shares" />
              <HeaderCell column="value" label="Value" />
              <HeaderCell column="dividendRate" label="Div Rate" />
              <HeaderCell column="dividendYield" label="Yield" />
              <HeaderCell column="annualIncome" label="Annual $" />
              <HeaderCell column="payoutRatio" label="Payout" />
              <HeaderCell column="exDividendDate" label="Ex-Div" />
              <HeaderCell column="daysToExDiv" label="Days" />
              <HeaderCell column="dividendDate" label="Pay Date" />
              <HeaderCell column="fiveYearAvgYield" label="5Y Avg" />
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
                    className="flex items-center gap-3 hover:text-blue-400 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailsSymbol(holding.symbol);
                    }}
                  >
                    <StockIcon symbol={holding.symbol} />
                    <span className="font-semibold text-black dark:text-white">{holding.symbol}</span>
                  </button>
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
                    {formatPercent(holding.dividendYield)}
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
                        {formatPercent(holding.payoutRatio)}
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
    </>
  );
}
