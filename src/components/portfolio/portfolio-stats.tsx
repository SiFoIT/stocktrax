"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { PortfolioDashboardData, BreakdownItem } from "@/types";
import { formatCurrency, getChangeColor } from "@/lib/utils";
import { StatCard } from "@/components/ui/stat-card";
import { Panel } from "@/components/ui/panel";

// Chart series read the --chart-* tokens so light and dark stay in step.
const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function BreakdownTooltip({ active, payload, total }: { active?: boolean; payload?: Array<{ name: string; value: number }>; total: number }) {
  if (active && payload && payload.length) {
    const item = payload[0];
    const percent = ((item.value / total) * 100).toFixed(1);
    return (
      <div className="rounded-md border border-border bg-popover p-2.5 shadow-md">
        <p className="text-sm font-medium text-foreground">{item.name}</p>
        <p className="text-muted-foreground text-sm">{formatCurrency(item.value, "CAD")}</p>
        <p className="text-muted-foreground text-xs">{percent}%</p>
      </div>
    );
  }
  return null;
}

function TopHoldingsTooltip({ active, payload, totalMarketValue }: { active?: boolean; payload?: Array<{ value: number; payload: BreakdownItem }>; totalMarketValue: number }) {
  if (active && payload && payload.length) {
    const pct = totalMarketValue > 0 ? ((payload[0].value / totalMarketValue) * 100).toFixed(1) : "0";
    return (
      <div className="rounded-md border border-border bg-popover p-2.5 shadow-md">
        <p className="text-sm font-medium text-foreground">{payload[0].payload.name}</p>
        <p className="text-muted-foreground text-sm">{formatCurrency(payload[0].value, "CAD")}</p>
        <p className="text-muted-foreground text-xs">{pct}%</p>
      </div>
    );
  }
  return null;
}

function renderBarLabel(totalMarketValue: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LabelComponent = (props: any) => {
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
  LabelComponent.displayName = "BarLabel";
  return LabelComponent;
}

interface PortfolioStatsProps {
  data: PortfolioDashboardData | null;
  loading: boolean;
  dividendsCadTotal?: number;
  showTotalValue?: boolean;
  showTotalReturn?: boolean;
  showDividends?: boolean;
}

function BreakdownChart({ title, data }: { title: string; data: BreakdownItem[] }) {
  if (data.length === 0) {
    return (
      <Panel className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
        <div className="flex items-center justify-center h-[200px]">
          <span className="text-subtle-foreground text-sm">No data</span>
        </div>
      </Panel>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Panel className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
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
                    className="transition-colors hover:opacity-80"
                  />
                ))}
              </Pie>
              <Tooltip content={<BreakdownTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-full lg:w-1/2 space-y-1.5">
          {data.map((item, index) => {
            const percent = ((item.value / total) * 100).toFixed(1);
            return (
              <div
                key={item.name}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-xs text-foreground truncate flex-1">{item.name}</span>
                <span className="text-xs text-muted-foreground font-mono">{percent}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function TopHoldingsChart({ data, totalMarketValue }: { data: BreakdownItem[]; totalMarketValue: number }) {
  if (data.length === 0) return null;

  return (
    <Panel className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Top Holdings</h3>
      <div className="max-h-[400px] overflow-y-auto">
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 32)}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 150, top: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={80}
              tick={{ fontSize: 12, fill: "rgba(128,128,128,0.7)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<TopHoldingsTooltip totalMarketValue={totalMarketValue} />} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={24} label={renderBarLabel(totalMarketValue)}>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

export function PortfolioStats({ data, loading, dividendsCadTotal, showTotalValue = true, showTotalReturn = true, showDividends = false }: PortfolioStatsProps) {
  const [now] = useState(() => Date.now());

  const cardCount = 3 + (showTotalValue ? 1 : 0) + (showTotalReturn ? 1 : 0) + (showDividends ? 1 : 0);
  const gridCols = cardCount <= 3 ? "lg:grid-cols-3" : cardCount === 4 ? "lg:grid-cols-4" : "lg:grid-cols-5";

  if (loading) {
    return (
      <div className="space-y-4">
        <div className={`grid grid-cols-2 ${gridCols} gap-2.5`}>
          {Array.from({ length: cardCount }, (_, i) => (
            <div key={i} className="h-24 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.portfolios.length === 0) return null;

  const { totals, breakdowns } = data;

  // Always include dividends
  const divTotal = dividendsCadTotal ?? (totals.totalDividends ?? 0);
  const adjustedGainLoss = totals.gainLoss + divTotal;
  const adjustedGainLossPercent = totals.costBasis > 0 ? (adjustedGainLoss / totals.costBasis) * 100 : 0;
  const gainColor = getChangeColor(adjustedGainLoss);

  // Compute CAGR date context
  const earliestDate = new Date(totals.earliestTransactionDate);
  const yearsSince = (now - earliestDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const cagrSubValue = `Since ${earliestDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })} (${yearsSince.toFixed(1)} yrs)`;

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className={`grid grid-cols-2 ${gridCols} gap-2.5`}>
        {showTotalValue && (
          <StatCard
            label="Total Value"
            value={formatCurrency(totals.marketValue + (totals.totalCash ?? 0), "CAD")}
          />
        )}
        {showTotalReturn && (
          <StatCard
            label="Total Return"
            value={formatCurrency(adjustedGainLoss, "CAD")}
            valueClass={gainColor}
            sub={`${adjustedGainLossPercent >= 0 ? "+" : ""}${adjustedGainLossPercent.toFixed(2)}%${
              divTotal > 0 ? ` · incl. ${formatCurrency(divTotal, "CAD")} div` : ""
            }`}
            subClass={gainColor}
          />
        )}
        {showDividends && (
          <StatCard
            label="Dividends"
            value={formatCurrency(divTotal, "CAD")}
            valueClass={divTotal > 0 ? "text-positive" : undefined}
          />
        )}
        <StatCard
          label="CAGR"
          value={`${totals.cagr >= 0 ? "+" : ""}${totals.cagr.toFixed(2)}%`}
          sub={cagrSubValue}
          valueClass={getChangeColor(totals.cagr)}
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

      {/* Period returns row */}
      {totals.periodReturns && (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
          {[
            { key: "1D", label: "Today" },
            { key: "5D", label: "5 Days" },
            { key: "1M", label: "1 Month" },
            { key: "3M", label: "3 Months" },
            { key: "1Y", label: "1 Year" },
          ].map(({ key, label }) => {
            const pr = totals.periodReturns![key];
            if (!pr) return null;
            const color = getChangeColor(pr.amount);
            return (
              <StatCard
                key={key}
                size="sm"
                label={label}
                value={`${pr.amount >= 0 ? "+" : ""}${formatCurrency(pr.amount, "CAD")}`}
                valueClass={color}
                sub={`${pr.percent >= 0 ? "+" : ""}${pr.percent.toFixed(2)}%`}
                subClass={color}
              />
            );
          })}
        </div>
      )}

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BreakdownChart
          title="Asset Type"
          data={breakdowns.assetType}
        />
        <BreakdownChart
          title="Currency Allocation"
          data={breakdowns.currency}
        />
        <BreakdownChart
          title="Sector Allocation"
          data={breakdowns.sector}
        />
        <TopHoldingsChart data={breakdowns.topHoldings} totalMarketValue={totals.marketValue} />
      </div>
    </div>
  );
}
