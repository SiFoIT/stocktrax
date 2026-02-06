"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { PortfolioDashboardData, BreakdownItem } from "@/types";
import { formatCurrency, getChangeColor } from "@/lib/utils";

const COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#6366f1", // indigo
];

interface PortfolioStatsProps {
  data: PortfolioDashboardData | null;
  loading: boolean;
}

function StatCard({ label, value, subValue, colorClass }: { label: string; value: string; subValue?: string; colorClass?: string }) {
  return (
    <div className="rounded-xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-4">
      <p className="text-xs font-medium text-black/50 dark:text-white/50 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold ${colorClass || "text-black dark:text-white"}`}>{value}</p>
      {subValue && (
        <p className={`text-sm mt-0.5 ${colorClass || "text-black/60 dark:text-white/60"}`}>{subValue}</p>
      )}
    </div>
  );
}

function BreakdownChart({ title, data, icon }: { title: string; data: BreakdownItem[]; icon: React.ReactNode }) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-4">
        <div className="flex items-center gap-2 mb-4">
          {icon}
          <h3 className="font-semibold text-sm text-black dark:text-white">{title}</h3>
        </div>
        <div className="flex items-center justify-center h-[200px]">
          <span className="text-black/30 dark:text-white/30 text-sm">No data</span>
        </div>
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      const percent = ((item.value / total) * 100).toFixed(1);
      return (
        <div className="bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl p-3 shadow-xl">
          <p className="font-semibold text-white">{item.name}</p>
          <p className="text-white/70 text-sm">{formatCurrency(item.value, "CAD")}</p>
          <p className="text-white/50 text-xs">{percent}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-4">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="font-semibold text-sm text-black dark:text-white">{title}</h3>
      </div>
      <div className="flex flex-col lg:flex-row items-center gap-4">
        <div className="w-full lg:w-1/2">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                stroke="transparent"
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                    className="transition-all hover:opacity-80"
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-full lg:w-1/2 space-y-1.5">
          {data.map((item, index) => {
            const percent = ((item.value / total) * 100).toFixed(1);
            return (
              <div
                key={item.name}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-all"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-xs text-black dark:text-white truncate flex-1">{item.name}</span>
                <span className="text-xs text-black/50 dark:text-white/50 font-mono">{percent}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TopHoldingsChart({ data, totalMarketValue }: { data: BreakdownItem[]; totalMarketValue: number }) {
  if (data.length === 0) return null;

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: BreakdownItem }> }) => {
    if (active && payload && payload.length) {
      const pct = totalMarketValue > 0 ? ((payload[0].value / totalMarketValue) * 100).toFixed(1) : "0";
      return (
        <div className="bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl p-3 shadow-xl">
          <p className="font-semibold text-white">{payload[0].payload.name}</p>
          <p className="text-white/70 text-sm">{formatCurrency(payload[0].value, "CAD")}</p>
          <p className="text-white/50 text-xs">{pct}%</p>
        </div>
      );
    }
    return null;
  };

  // Custom bar label showing both $ and %
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderBarLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    const pct = totalMarketValue > 0 ? ((value / totalMarketValue) * 100).toFixed(1) : "0";
    return (
      <text
        x={(x ?? 0) + (width ?? 0) + 6}
        y={(y ?? 0) + (height ?? 0) / 2}
        dominantBaseline="central"
        fontSize={11}
        fill="rgba(128,128,128,0.7)"
      >
        {formatCurrency(value ?? 0, "CAD")} · {pct}%
      </text>
    );
  };

  return (
    <div className="rounded-xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-md bg-amber-500/20 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="font-semibold text-sm text-black dark:text-white">Top Holdings</h3>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 32)}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 140, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={60}
            tick={{ fontSize: 12, fill: "rgba(128,128,128,0.7)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={24} label={renderBarLabel}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PortfolioStats({ data, loading }: PortfolioStatsProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-black/5 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-black/5 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.portfolios.length === 0) return null;

  const { totals, breakdowns } = data;
  const gainColor = getChangeColor(totals.gainLoss);

  // Compute CAGR date context
  const earliestDate = new Date(totals.earliestTransactionDate);
  const yearsSince = (Date.now() - earliestDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const cagrSubValue = `Since ${earliestDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })} (${yearsSince.toFixed(1)} yrs)`;

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Return"
          value={formatCurrency(totals.gainLoss, "CAD")}
          subValue={`${totals.gainLossPercent >= 0 ? "+" : ""}${totals.gainLossPercent.toFixed(2)}%`}
          colorClass={gainColor}
        />
        <StatCard
          label="CAGR"
          value={`${totals.cagr >= 0 ? "+" : ""}${totals.cagr.toFixed(2)}%`}
          subValue={cagrSubValue}
          colorClass={getChangeColor(totals.cagr)}
        />
        <StatCard
          label="Market Value"
          value={formatCurrency(totals.marketValue, "CAD")}
        />
        <StatCard
          label="Cost Basis"
          value={formatCurrency(totals.costBasis, "CAD")}
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownChart
          title="Asset Type"
          data={breakdowns.assetType}
          icon={
            <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              </svg>
            </div>
          }
        />
        <BreakdownChart
          title="Currency Allocation"
          data={breakdowns.currency}
          icon={
            <div className="w-6 h-6 rounded-md bg-cyan-500/20 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          }
        />
        <BreakdownChart
          title="Sector Allocation"
          data={breakdowns.sector}
          icon={
            <div className="w-6 h-6 rounded-md bg-violet-500/20 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          }
        />
        <TopHoldingsChart data={breakdowns.topHoldings} totalMarketValue={totals.marketValue} />
      </div>
    </div>
  );
}
