"use client";

import { StockIcon } from "@/components/ui/stock-icon";
import { HoldingWithQuote } from "@/types";

interface HoldingsTableProps {
  holdings: HoldingWithQuote[];
  selectedSymbol?: string;
  onSelectHolding: (symbol: string) => void;
  onDeleteHolding: (id: number) => void;
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
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getChangeColor(value: number | undefined): string {
  if (value === undefined) return "text-black/50 dark:text-black dark:text-white/50";
  return value >= 0 ? "text-emerald-400" : "text-red-400";
}

function getChangeBg(value: number | undefined): string {
  if (value === undefined) return "bg-black/5 dark:bg-white/5";
  return value >= 0 ? "bg-emerald-500/10" : "bg-red-500/10";
}

export function HoldingsTable({
  holdings,
  selectedSymbol,
  onSelectHolding,
  onDeleteHolding,
}: HoldingsTableProps) {
  if (holdings.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-black dark:text-white mb-2">No Holdings Yet</h3>
        <p className="text-black/50 dark:text-black dark:text-white/50">Add your first holding using the form above.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-black/10 dark:border-white/10">
            <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-black dark:text-white/50 uppercase tracking-wider text-left">Symbol</th>
            <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-black dark:text-white/50 uppercase tracking-wider text-right">Shares</th>
            <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-black dark:text-white/50 uppercase tracking-wider text-right">Avg Cost</th>
            <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-black dark:text-white/50 uppercase tracking-wider text-right">Price</th>
            <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-black dark:text-white/50 uppercase tracking-wider text-right">Value</th>
            <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-black dark:text-white/50 uppercase tracking-wider text-right">Gain/Loss</th>
            <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-black dark:text-white/50 uppercase tracking-wider text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding, index) => (
            <tr
              key={holding.id}
              className={`border-b border-white/5 cursor-pointer transition-all hover:bg-black/5 dark:bg-white/5 ${
                selectedSymbol === holding.symbol
                  ? "bg-gradient-to-r from-blue-500/10 to-transparent"
                  : ""
              } ${index % 2 === 0 ? "bg-black/[0.02] dark:bg-white/[0.02]" : ""}`}
              onClick={() => onSelectHolding(holding.symbol)}
            >
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <StockIcon symbol={holding.symbol} />
                  <span className="font-semibold text-black dark:text-white">{holding.symbol}</span>
                </div>
              </td>
              <td className="px-4 py-4 text-right">
                <span className="font-mono text-black dark:text-white">{holding.shares.toLocaleString()}</span>
              </td>
              <td className="px-4 py-4 text-right">
                <span className="font-mono text-black dark:text-black/70 dark:text-white/70">{formatCurrency(holding.avgCost)}</span>
              </td>
              <td className="px-4 py-4 text-right">
                <span className="font-mono font-semibold text-black dark:text-white">{formatCurrency(holding.currentPrice)}</span>
              </td>
              <td className="px-4 py-4 text-right">
                <span className="font-mono font-semibold text-black dark:text-white">{formatCurrency(holding.marketValue)}</span>
              </td>
              <td className="px-4 py-4 text-right">
                {holding.gainLoss !== undefined && (
                  <div className="flex flex-col items-end gap-1">
                    <span className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${getChangeBg(holding.gainLoss)} ${getChangeColor(holding.gainLoss)}`}>
                      {formatCurrency(holding.gainLoss)}
                    </span>
                    <span className={`text-xs ${getChangeColor(holding.gainLossPercent)}`}>
                      {formatPercent(holding.gainLossPercent)}
                    </span>
                  </div>
                )}
              </td>
              <td className="px-4 py-4 text-right">
                <button
                  className="text-black dark:text-black/40 dark:text-white/40 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteHolding(holding.id);
                  }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
