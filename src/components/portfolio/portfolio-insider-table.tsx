"use client";

import { useState, useMemo } from "react";
import { StockIcon } from "@/components/ui/stock-icon";
import { InfoTip } from "@/components/ui/info-tip";
import { HoldingWithQuote } from "@/types";
import { StockDetailsModal } from "@/components/stocks/stock-details-modal";
import { PriceChartModal } from "@/components/charts/price-chart-modal";
import { formatCurrency } from "@/lib/utils";

type SortColumn = "symbol" | "shares" | "value" | "insidersPercentHeld" | "netBuyCount6mo" | "netSellCount6mo" | "netInsiderShares6mo" | "lastInsiderDate";
type SortDirection = "asc" | "desc";

interface PortfolioInsiderTableProps {
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

export function PortfolioInsiderTable({
  holdings,
  storageKey,
}: PortfolioInsiderTableProps) {
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
        case "shares":
          aVal = a.shares;
          bVal = b.shares;
          break;
        case "value":
          aVal = a.marketValue;
          bVal = b.marketValue;
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

  const HeaderCell = ({ column, label, align = "right", tooltip }: { column: SortColumn; label: string; align?: "left" | "right"; tooltip?: string }) => (
    <th
      className={`px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider cursor-pointer hover:text-black dark:hover:text-white/80 transition-colors select-none whitespace-nowrap ${align === "left" ? "text-left" : "text-right"}`}
      onClick={() => handleSort(column)}
    >
      {label}
      {tooltip && <InfoTip text={tooltip} />}
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
              <HeaderCell column="shares" label="Shares" />
              <HeaderCell column="value" label="Value" />
              <HeaderCell column="insidersPercentHeld" label="Insider %" tooltip="Percentage of outstanding shares held by company insiders (officers, directors, and beneficial owners)." />
              <HeaderCell column="netBuyCount6mo" label="Buys (6mo)" tooltip="Number of insider buy transactions in the last 6 months." />
              <HeaderCell column="netSellCount6mo" label="Sells (6mo)" tooltip="Number of insider sell transactions in the last 6 months." />
              <HeaderCell column="netInsiderShares6mo" label="Net Shares" tooltip="Net insider transactions in the last 6 months (buys minus sells). This is a transaction count, not a share count." />
              <HeaderCell column="lastInsiderDate" label="Last Activity" tooltip="Most recent insider purchase or sale transaction." />
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((holding, index) => {
              const netShares = holding.netInsiderShares6mo;
              const netColor = netShares === undefined || netShares === null
                ? "text-black/50 dark:text-white/50"
                : netShares > 0
                  ? "text-emerald-400"
                  : netShares < 0
                    ? "text-red-400"
                    : "text-black/50 dark:text-white/50";

              return (
                <tr
                  key={holding.id}
                  className={`border-b border-white/5 transition-all hover:bg-black/5 dark:hover:bg-white/5 ${index % 2 === 0 ? "bg-black/[0.02] dark:bg-white/[0.02]" : ""}`}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        className="group/sym relative flex items-center gap-3 transition-colors"
                        onClick={() => setDetailsSymbol(holding.symbol)}
                      >
                        <StockIcon symbol={holding.symbol} />
                        <span className="font-semibold text-blue-400 group-hover/sym:text-blue-300 underline decoration-blue-400/40 group-hover/sym:decoration-blue-300 underline-offset-2 transition-colors">{holding.symbol}</span>
                        {holding.shortName && (
                          <span className="pointer-events-none absolute left-0 -top-9 z-50 hidden group-hover/sym:block whitespace-nowrap rounded-lg bg-zinc-800 border border-white/10 px-3 py-1.5 text-xs text-white shadow-xl">
                            {holding.shortName}
                          </span>
                        )}
                      </button>
                      <button
                        className="text-black/30 dark:text-white/30 hover:text-blue-400 transition-colors p-1 rounded"
                        onClick={() => {
                          const idx = sortedHoldings.findIndex((h) => h.symbol === holding.symbol);
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
                    <span className="font-mono text-black dark:text-white">{holding.shares.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="font-mono font-semibold text-black dark:text-white">{formatCurrency(holding.marketValue, holding.currency)}</span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-black/70 dark:text-white/70">{formatInsiderPercent(holding.insidersPercentHeld)}</span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className={holding.netBuyCount6mo ? "text-emerald-400" : "text-black/50 dark:text-white/50"}>
                      {formatCount(holding.netBuyCount6mo)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className={holding.netSellCount6mo ? "text-red-400" : "text-black/50 dark:text-white/50"}>
                      {formatCount(holding.netSellCount6mo)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className={`font-mono font-medium ${netColor}`}>
                      {netShares !== undefined && netShares !== null ? netShares.toLocaleString() : "\u2014"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-xs text-black/60 dark:text-white/60">
                      {formatLastActivity(holding.lastInsiderName, holding.lastInsiderType, holding.lastInsiderDate)}
                    </span>
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
