"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { StockIcon } from "@/components/ui/stock-icon";
import { StockDetailsModal } from "@/components/stocks/stock-details-modal";
import { InfoTip } from "@/components/ui/info-tip";
import { HoldingWithQuote, TransactionWithSymbol } from "@/types";
import { formatCurrency } from "@/lib/utils";

type SortColumn =
  | "symbol"
  | "totalReceived"
  | "yoc"
  | "currentYield"
  | "annualDollar"
  | "frequency"
  | "monthlyAvg";
type SortDirection = "asc" | "desc";
type ChartPeriod = "monthly" | "quarterly";

interface DividendReturnsTableProps {
  holdings: HoldingWithQuote[];
  transactions: TransactionWithSymbol[];
  storageKey?: string;
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  return (
    <span
      className={`ml-1 transition-opacity ${direction ? "opacity-100" : "opacity-30"}`}
    >
      {direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}
    </span>
  );
}

function inferFrequency(dates: string[]): string {
  if (dates.length < 2) return "-";
  const sorted = [...dates].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diff =
      (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) /
      (1000 * 60 * 60 * 24);
    gaps.push(diff);
  }
  // Use median gap for robustness
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];

  if (median <= 45) return "Monthly";
  if (median <= 120) return "Quarterly";
  if (median <= 210) return "Semi-Annual";
  if (median <= 400) return "Annual";
  return "Irregular";
}

function frequencyOrder(freq: string): number {
  switch (freq) {
    case "Monthly":
      return 1;
    case "Quarterly":
      return 2;
    case "Semi-Annual":
      return 3;
    case "Annual":
      return 4;
    case "Irregular":
      return 5;
    default:
      return 6;
  }
}

function formatPeriodLabel(
  year: number,
  periodIndex: number,
  mode: ChartPeriod
): string {
  if (mode === "quarterly") {
    return `${year}-Q${periodIndex + 1}`;
  }
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const shortYear = String(year).slice(-2);
  return `${monthNames[periodIndex]} '${shortYear}`;
}

export function DividendReturnsTable({
  holdings,
  transactions,
}: DividendReturnsTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [detailsSymbol, setDetailsSymbol] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("monthly");

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  // Filter to dividend transactions only
  const dividendTxns = useMemo(
    () => transactions.filter((t) => t.type === "dividend"),
    [transactions]
  );

  // ─── Summary stats ───
  const totalReceived = useMemo(
    () => dividendTxns.reduce((sum, t) => sum + t.shares * t.price, 0),
    [dividendTxns]
  );

  const totalCostBasis = useMemo(
    () => holdings.reduce((sum, h) => sum + h.shares * h.avgCost, 0),
    [holdings]
  );

  const projectedAnnual = useMemo(
    () =>
      holdings.reduce(
        (sum, h) => sum + (h.dividendRate ? h.shares * h.dividendRate : 0),
        0
      ),
    [holdings]
  );

  const yieldOnCost = totalCostBasis > 0 ? (projectedAnnual / totalCostBasis) * 100 : 0;

  const currentYieldWeighted = useMemo(() => {
    const totalMarketValue = holdings.reduce(
      (sum, h) => sum + (h.marketValue || 0),
      0
    );
    if (totalMarketValue === 0) return 0;
    return holdings.reduce((acc, h) => {
      const mv = h.marketValue || 0;
      const yld = h.dividendYield || 0;
      return acc + yld * (mv / totalMarketValue);
    }, 0);
  }, [holdings]);

  const monthsSinceFirstDividend = useMemo(() => {
    if (dividendTxns.length === 0) return 0;
    const dates = dividendTxns.map((t) => new Date(t.date).getTime());
    const earliest = new Date(Math.min(...dates));
    const now = new Date();
    const months =
      (now.getFullYear() - earliest.getFullYear()) * 12 +
      (now.getMonth() - earliest.getMonth()) +
      1;
    return Math.max(months, 1);
  }, [dividendTxns]);

  const monthlyAvg =
    monthsSinceFirstDividend > 0 ? totalReceived / monthsSinceFirstDividend : 0;

  // ─── Bar chart data ───
  const chartData = useMemo(() => {
    if (dividendTxns.length === 0) return [];

    const buckets = new Map<string, number>();
    for (const txn of dividendTxns) {
      const d = new Date(txn.date);
      const year = d.getFullYear();
      const month = d.getMonth();
      const periodIndex =
        chartPeriod === "quarterly" ? Math.floor(month / 3) : month;
      const key = `${year}-${periodIndex}`;
      buckets.set(key, (buckets.get(key) || 0) + txn.shares * txn.price);
    }

    // Build sorted entries
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, amount]) => {
        const [yearStr, periodStr] = key.split("-");
        return {
          label: formatPeriodLabel(
            Number(yearStr),
            Number(periodStr),
            chartPeriod
          ),
          amount: Math.round(amount * 100) / 100,
        };
      });
  }, [dividendTxns, chartPeriod]);

  // ─── Per-stock table data ───
  const perStockData = useMemo(() => {
    return holdings.map((h) => {
      const txns = dividendTxns.filter((t) => t.holdingId === h.id);
      const received = txns.reduce((sum, t) => sum + t.shares * t.price, 0);
      const dates = txns.map((t) => t.date);
      const freq = inferFrequency(dates);

      // months for this specific stock
      let stockMonths = 0;
      if (txns.length > 0) {
        const stockDates = txns.map((t) => new Date(t.date).getTime());
        const earliest = new Date(Math.min(...stockDates));
        const now = new Date();
        stockMonths =
          (now.getFullYear() - earliest.getFullYear()) * 12 +
          (now.getMonth() - earliest.getMonth()) +
          1;
        stockMonths = Math.max(stockMonths, 1);
      }

      const yoc =
        h.avgCost > 0 && h.dividendRate
          ? (h.dividendRate / h.avgCost) * 100
          : undefined;

      return {
        holding: h,
        totalReceived: received,
        yoc,
        currentYield: h.dividendYield,
        annualDollar: h.dividendRate ? h.shares * h.dividendRate : 0,
        frequency: freq,
        monthlyAvg: stockMonths > 0 ? received / stockMonths : 0,
      };
    });
  }, [holdings, dividendTxns]);

  const sortedPerStock = useMemo(() => {
    if (!sortColumn) return perStockData;

    return [...perStockData].sort((a, b) => {
      let aVal: number | string | undefined;
      let bVal: number | string | undefined;

      switch (sortColumn) {
        case "symbol":
          aVal = a.holding.symbol;
          bVal = b.holding.symbol;
          break;
        case "totalReceived":
          aVal = a.totalReceived;
          bVal = b.totalReceived;
          break;
        case "yoc":
          aVal = a.yoc;
          bVal = b.yoc;
          break;
        case "currentYield":
          aVal = a.currentYield;
          bVal = b.currentYield;
          break;
        case "annualDollar":
          aVal = a.annualDollar;
          bVal = b.annualDollar;
          break;
        case "frequency":
          aVal = frequencyOrder(a.frequency);
          bVal = frequencyOrder(b.frequency);
          break;
        case "monthlyAvg":
          aVal = a.monthlyAvg;
          bVal = b.monthlyAvg;
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
  }, [perStockData, sortColumn, sortDirection]);

  // ─── Edge case: nothing at all ───
  const hasDividendTxns = dividendTxns.length > 0;
  const hasDividendHoldings = holdings.some((h) => h.dividendRate && h.dividendRate > 0);

  if (!hasDividendTxns && !hasDividendHoldings) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-black dark:text-white mb-2">
          No Dividend Data
        </h3>
        <p className="text-black/50 dark:text-white/50">
          Add dividend transactions or holdings with dividend-paying stocks to
          see returns here.
        </p>
      </div>
    );
  }

  const headerCell = (column: SortColumn, label: string, align: "left" | "right" = "right", tooltip?: string) => (
    <th
      className={`px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider cursor-pointer hover:text-black dark:hover:text-white/80 transition-colors select-none whitespace-nowrap ${align === "left" ? "text-left" : "text-right"}`}
      onClick={() => handleSort(column)}
    >
      {label}
      {tooltip && <InfoTip text={tooltip} />}
      <SortIcon direction={sortColumn === column ? sortDirection : null} />
    </th>
  );

  const fmtDollar = (v: number) =>
    `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      {/* ─── Summary Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-5">
          <p className="text-sm font-medium text-black/50 dark:text-white/50 mb-1">
            Total Received
            <InfoTip text="Sum of all dividend payments recorded as transactions." />
          </p>
          <p className="text-2xl font-bold text-emerald-400">
            {fmtDollar(totalReceived)}
          </p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-5">
          <p className="text-sm font-medium text-black/50 dark:text-white/50 mb-1">
            Projected Annual
            <InfoTip text="Forward-looking estimate based on each holding's current dividend rate and shares owned." />
          </p>
          <p className="text-2xl font-bold text-emerald-400">
            {fmtDollar(projectedAnnual)}
          </p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-5">
          <p className="text-sm font-medium text-black/50 dark:text-white/50 mb-1">
            Yield on Cost
            <InfoTip text="Projected annual income divided by your total cost basis. Reflects yield relative to what you paid." />
          </p>
          <p className="text-2xl font-bold text-emerald-400">
            {yieldOnCost.toFixed(2)}%
          </p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-5">
          <p className="text-sm font-medium text-black/50 dark:text-white/50 mb-1">
            Current Yield
            <InfoTip text="Weighted average dividend yield across holdings, based on current market value." />
          </p>
          <p className="text-2xl font-bold text-emerald-400">
            {(currentYieldWeighted * 100).toFixed(2)}%
          </p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-5">
          <p className="text-sm font-medium text-black/50 dark:text-white/50 mb-1">
            Monthly Avg
            <InfoTip text="Total received divided by months since your first dividend transaction." />
          </p>
          <p className="text-2xl font-bold text-emerald-400">
            {fmtDollar(monthlyAvg)}
          </p>
        </div>
      </div>

      {/* ─── Bar Chart ─── */}
      <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-black dark:text-white">
            Dividend Income
          </h3>
          <div className="flex gap-1 p-1 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
            <button
              onClick={() => setChartPeriod("monthly")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                chartPeriod === "monthly"
                  ? "bg-emerald-500 text-white"
                  : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setChartPeriod("quarterly")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                chartPeriod === "quarterly"
                  ? "bg-emerald-500 text-white"
                  : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              Quarterly
            </button>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-black/40 dark:text-white/40 text-sm">
            No dividend transactions to chart yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <XAxis
                dataKey="label"
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(15, 15, 20, 0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  padding: "10px 14px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                }}
                labelStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}
                itemStyle={{ color: "#34d399", fontWeight: 600 }}
                formatter={(value: number | undefined) => [`$${(value ?? 0).toFixed(2)}`, "Income"]}
              />
              <Bar
                dataKey="amount"
                fill="#34d399"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ─── Per-Stock Table ─── */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              {headerCell("symbol", "Symbol", "left")}
              {headerCell("totalReceived", "Total Received", "right", "Sum of all dividend payments received for this stock.")}
              {headerCell("yoc", "YOC", "right", "Yield on Cost — annual dividend rate divided by your average cost per share.")}
              {headerCell("currentYield", "Yield", "right", "Current dividend yield based on today's market price.")}
              {headerCell("annualDollar", "Annual $", "right", "Projected annual dividend income (shares x dividend rate).")}
              {headerCell("frequency", "Frequency", "right", "Estimated payment frequency inferred from transaction dates.")}
              {headerCell("monthlyAvg", "Mo. Avg", "right", "Average monthly dividend income since your first payment for this stock.")}
            </tr>
          </thead>
          <tbody>
            {sortedPerStock.map((row, index) => (
              <tr
                key={row.holding.id}
                className={`border-b border-white/5 transition-all hover:bg-black/5 dark:hover:bg-white/5 ${index % 2 === 0 ? "bg-black/[0.02] dark:bg-white/[0.02]" : ""}`}
              >
                <td className="px-4 py-4">
                  <button
                    className="group/sym relative flex items-center gap-3 transition-colors"
                    onClick={() => setDetailsSymbol(row.holding.symbol)}
                  >
                    <StockIcon symbol={row.holding.symbol} />
                    <span className="font-semibold text-blue-400 group-hover/sym:text-blue-300 underline decoration-blue-400/40 group-hover/sym:decoration-blue-300 underline-offset-2 transition-colors">
                      {row.holding.symbol}
                    </span>
                    {row.holding.shortName && (
                      <span className="pointer-events-none absolute left-0 -top-9 z-50 hidden group-hover/sym:block whitespace-nowrap rounded-lg bg-zinc-800 border border-white/10 px-3 py-1.5 text-xs text-white shadow-xl">
                        {row.holding.shortName}
                      </span>
                    )}
                  </button>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono font-semibold text-black dark:text-white">
                    {formatCurrency(
                      row.totalReceived,
                      row.holding.currency
                    )}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span
                    className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${
                      row.yoc !== undefined
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "text-black/50 dark:text-white/50"
                    }`}
                  >
                    {row.yoc !== undefined
                      ? `${row.yoc.toFixed(2)}%`
                      : "-"}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span
                    className={`inline-block px-2 py-1 rounded-lg text-sm font-medium ${
                      row.currentYield !== undefined && row.currentYield > 0
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "text-black/50 dark:text-white/50"
                    }`}
                  >
                    {row.currentYield !== undefined
                      ? `${(row.currentYield * 100).toFixed(2)}%`
                      : "-"}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span
                    className={`font-mono font-semibold ${row.annualDollar > 0 ? "text-emerald-400" : "text-black/50 dark:text-white/50"}`}
                  >
                    {formatCurrency(
                      row.annualDollar || undefined,
                      row.holding.currency
                    )}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span
                    className={`inline-block px-2 py-1 rounded-lg text-xs font-medium ${
                      row.frequency !== "-"
                        ? "bg-black/5 dark:bg-white/5 text-black/70 dark:text-white/70"
                        : "text-black/50 dark:text-white/50"
                    }`}
                  >
                    {row.frequency}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono text-black dark:text-white">
                    {formatCurrency(
                      row.monthlyAvg > 0 ? row.monthlyAvg : undefined,
                      row.holding.currency
                    )}
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
    </div>
  );
}
