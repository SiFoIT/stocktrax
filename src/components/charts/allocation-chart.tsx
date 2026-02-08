"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { HoldingWithQuote } from "@/types";

interface AllocationChartProps {
  holdings: HoldingWithQuote[];
}

interface AllocationTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  total: number;
}

// Modern gradient-friendly colors
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

function AllocationTooltip({ active, payload, total }: AllocationTooltipProps) {
  if (active && payload && payload.length) {
    const item = payload[0];
    const percent = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
    return (
      <div className="bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl p-3 shadow-xl">
        <p className="font-semibold text-white">{item.name}</p>
        <p className="text-white/70 text-sm">
          ${item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p className="text-white/50 text-xs">{percent}% of portfolio</p>
      </div>
    );
  }
  return null;
}

export function AllocationChart({ holdings }: AllocationChartProps) {
  const data = holdings
    .filter((h) => h.marketValue && h.marketValue > 0)
    .map((h) => ({
      name: h.symbol,
      value: h.marketValue || 0,
    }))
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] gap-3">
        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
          <svg className="w-6 h-6 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
          </svg>
        </div>
        <span className="text-white/50 text-sm">No holdings to display</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row items-center gap-8">
      {/* Chart */}
      <div className="w-full lg:w-1/2">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={110}
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
            <Tooltip content={<AllocationTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="w-full lg:w-1/2 space-y-2">
        {data.map((item, index) => {
          const percent = ((item.value / total) * 100).toFixed(1);
          return (
            <div
              key={item.name}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-all"
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-white truncate">{item.name}</span>
                  <span className="text-white/50 text-sm">{percent}%</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${percent}%`,
                      backgroundColor: COLORS[index % COLORS.length],
                    }}
                  />
                </div>
              </div>
              <span className="text-white/70 text-sm font-mono">
                ${item.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
