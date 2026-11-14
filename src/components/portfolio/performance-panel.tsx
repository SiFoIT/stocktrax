"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "@/components/ui/panel";
import { cn, formatCurrency, formatPercent, getChangeColor } from "@/lib/utils";
import type { PerformanceData, PerformanceReturns } from "@/types";

type Range = "1Y" | "ALL";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 14, 2026" from a calendar day, without a timezone shift. */
function dayLabel(day: string, withYear = true): string {
  const [y, m, d] = day.split("-").map(Number);
  return withYear ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${d}`;
}

function axisLabel(day: string): string {
  const [y, m] = day.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

function compactCad(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(value / 1e3)}k`;
  return `$${Math.round(value)}`;
}

function ReturnValue({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return <span className={getChangeColor(value)}>{formatPercent(value)}</span>;
}

function Toggle<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2 py-0.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Account value over time against the money put in, with a benchmark that
 * received the same deposits on the same days, and the money-weighted
 * returns of each. Fetches its own data: it is a different (longer) query
 * than the summary the surrounding stats come from.
 */
export function PerformancePanel({ portfolioId }: { portfolioId?: number }) {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("ALL");
  const [benchmark, setBenchmark] = useState<string>("XEQT");

  useEffect(() => {
    let cancelled = false;
    const query = portfolioId != null ? `?portfolioId=${portfolioId}` : "";
    fetch(`/api/performance${query}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to load performance");
        return res.json() as Promise<PerformanceData>;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load performance");
      });
    return () => {
      cancelled = true;
    };
  }, [portfolioId]);

  const points = useMemo(() => {
    if (!data) return [];
    if (range === "ALL") return data.points;
    const [y, m, d] = data.asOf.split("-").map(Number);
    const start = `${y - 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return data.points.filter((p) => p.day >= start);
  }, [data, range]);

  if (error) {
    return (
      <Panel className="p-4">
        <h3 className="text-sm font-semibold text-foreground">Performance</h3>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </Panel>
    );
  }

  if (!data) {
    return (
      <Panel className="p-4">
        <h3 className="text-sm font-semibold text-foreground">Performance</h3>
        <div className="mt-3 h-[240px] animate-pulse rounded-md bg-muted" />
      </Panel>
    );
  }

  const last = data.points[data.points.length - 1];
  const gain = last.value - last.contributed;
  const rows: { label: string; returns: PerformanceReturns | null }[] = [
    { label: "Your portfolio", returns: data.returns.portfolio },
    ...data.benchmarks.map((b) => ({ label: `Same deposits in ${b.label}`, returns: data.returns.benchmarks[b.label] })),
  ];

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Performance</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Value {formatCurrency(last.value, "CAD")} · put in {formatCurrency(last.contributed, "CAD")} ·{" "}
            <span className={getChangeColor(gain)}>
              {gain >= 0 ? "+" : "−"}
              {formatCurrency(Math.abs(gain), "CAD")}
            </span>{" "}
            earned since {dayLabel(data.since)}
          </p>
        </div>
        <div className="flex gap-2">
          <Toggle
            label="Benchmark"
            value={benchmark}
            onChange={setBenchmark}
            options={data.benchmarks.map((b) => ({ value: b.label, label: b.label }))}
          />
          <Toggle
            label="Range"
            value={range}
            onChange={setRange}
            options={[
              { value: "1Y", label: "1Y" },
              { value: "ALL", label: "All" },
            ]}
          />
        </div>
      </div>

      <div className="mt-3 h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={axisLabel}
              minTickGap={40}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={compactCad}
              width={48}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelFormatter={(day) => dayLabel(String(day))}
              formatter={(value, name) => [formatCurrency(Number(value), "CAD"), String(name)]}
            />
            <Line
              type="monotone"
              dataKey="value"
              name="Your account"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey={(p: PerformanceData["points"][number]) => p.benchmarks[benchmark]}
              name={`Same deposits in ${benchmark}`}
              stroke="var(--chart-2)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="contributed"
              name="Money put in"
              stroke="var(--muted-foreground)"
              strokeDasharray="4 3"
              strokeWidth={1.25}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: "var(--chart-1)" }} /> Your account
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: "var(--chart-2)" }} /> Same deposits in {benchmark}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-muted-foreground" /> Money put in
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-1.5 text-left font-medium">Money-weighted return</th>
              <th className="py-1.5 text-right font-medium">YTD</th>
              <th className="py-1.5 text-right font-medium">1Y</th>
              <th className="py-1.5 text-right font-medium" title="Annualized since the first deposit">
                Per year
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.label} className="border-b border-border last:border-b-0">
                <td className={cn("py-1.5", i === 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {row.label}
                </td>
                <td className="py-1.5 text-right font-mono">
                  <ReturnValue value={row.returns?.ytd} />
                </td>
                <td className="py-1.5 text-right font-mono">
                  <ReturnValue value={row.returns?.oneYear} />
                </td>
                <td className="py-1.5 text-right font-mono">
                  <ReturnValue value={row.returns?.annualized} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-subtle-foreground">
        Each benchmark receives the same deposits on the same days, so the comparison isn&apos;t skewed by when
        money went in. Includes cash. As of {dayLabel(data.asOf)}.
        {data.missing.length > 0 && ` No price history for ${data.missing.join(", ")}; valued at last trade price.`}
        {data.fxStale && " USD/CAD history unavailable; today's rate used throughout."}
      </p>
    </Panel>
  );
}
