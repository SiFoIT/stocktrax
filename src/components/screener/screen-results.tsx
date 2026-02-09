"use client";

import { useState } from "react";
import { METRICS, type ScreenRule } from "@/lib/screener/metrics";
import type { ScreenResult } from "@/lib/screener/api";

interface ScreenResultsProps {
  results: ScreenResult[] | null;
  rules: ScreenRule[];
  totalScanned: number;
  matchCount: number;
}

type SortDir = "asc" | "desc";

function formatMetricValue(value: number | undefined, unit: string): string {
  if (value === undefined || value === null) return "N/A";
  if (unit === "$" && Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (unit === "$" && Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (unit === "$") return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (unit === "%") return `${value.toFixed(2)}%`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  return value.toFixed(2);
}

export function ScreenResults({ results, rules, totalScanned, matchCount }: ScreenResultsProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  if (results === null) {
    return (
      <div className="flex items-center justify-center py-16 text-black/40 dark:text-white/40">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <p className="text-sm">Configure rules and run a screen to see results</p>
        </div>
      </div>
    );
  }

  const usedMetrics = [...new Set(rules.map((r) => r.metric))];

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedResults = [...results].sort((a, b) => {
    if (!sortKey) return 0;
    let aVal: number | undefined;
    let bVal: number | undefined;

    if (sortKey === "symbol") return sortDir === "asc" ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
    if (sortKey === "price") { aVal = a.price; bVal = b.price; }
    else if (sortKey === "changePercent") { aVal = a.changePercent; bVal = b.changePercent; }
    else { aVal = a.metricValues[sortKey]; bVal = b.metricValues[sortKey]; }

    const aNum = aVal ?? -Infinity;
    const bNum = bVal ?? -Infinity;
    return sortDir === "asc" ? aNum - bNum : bNum - aNum;
  });

  const renderSortHeader = (label: string, sortKeyName: string) => (
    <th
      key={sortKeyName}
      className="px-3 py-2 text-left text-xs font-medium text-black/50 dark:text-white/50 cursor-pointer hover:text-black dark:hover:text-white transition-colors whitespace-nowrap"
      onClick={() => handleSort(sortKeyName)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortKey === sortKeyName && (
          <svg className={`w-3 h-3 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
    </th>
  );

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-3 text-sm">
        <span className="text-black/50 dark:text-white/50">
          Scanned <span className="font-semibold text-black dark:text-white">{totalScanned}</span> symbols
        </span>
        <span className="text-black/50 dark:text-white/50">
          <span className="font-semibold text-violet-500">{matchCount}</span> match{matchCount !== 1 ? "es" : ""}
        </span>
      </div>

      {results.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-black/40 dark:text-white/40">
          <div className="text-center">
            <svg className="w-10 h-10 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
            </svg>
            <p className="text-sm">No stocks matched your criteria</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10">
                {renderSortHeader("Symbol", "symbol")}
                <th className="px-3 py-2 text-left text-xs font-medium text-black/50 dark:text-white/50">Name</th>
                {renderSortHeader("Price", "price")}
                {renderSortHeader("Change %", "changePercent")}
                {usedMetrics.map((key) => renderSortHeader(METRICS[key]?.label ?? key, key))}
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((result) => (
                <tr
                  key={result.symbol}
                  className="border-b border-black/5 dark:border-white/5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-3 py-2.5 font-semibold text-black dark:text-white">{result.symbol}</td>
                  <td className="px-3 py-2.5 text-black/60 dark:text-white/60 max-w-[200px] truncate">
                    {result.shortName ?? ""}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-black dark:text-white">
                    {result.price != null ? `$${result.price.toFixed(2)}` : "N/A"}
                  </td>
                  <td className={`px-3 py-2.5 font-mono ${
                    (result.changePercent ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"
                  }`}>
                    {result.changePercent != null ? `${result.changePercent >= 0 ? "+" : ""}${result.changePercent.toFixed(2)}%` : "N/A"}
                  </td>
                  {usedMetrics.map((key) => {
                    const metricDef = METRICS[key];
                    const value = result.metricValues[key];
                    return (
                      <td key={key} className="px-3 py-2.5 font-mono text-black/70 dark:text-white/70">
                        {formatMetricValue(value, metricDef?.unit ?? "")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
