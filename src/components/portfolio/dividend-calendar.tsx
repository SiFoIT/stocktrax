"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { ChevronRight } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import type { CalendarMonth, CalendarPayment, DividendCalendar as CalendarData } from "@/lib/dividend-calendar";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HATCH_ID = "dividend-calendar-hatch";

function monthLabel(month: string, withYear = true): string {
  const [y, m] = month.split("-");
  const name = MONTHS[Number(m) - 1];
  return withYear ? `${name} ${y}` : name;
}

/** Axis tick: month name, with the year on January and the window's first month. */
function tickLabel(month: string, index: number): string {
  const [y, m] = month.split("-");
  return m === "01" || index === 0 ? `${MONTHS[Number(m) - 1]} '${y.slice(2)}` : MONTHS[Number(m) - 1];
}

const cad = (v: number, digits = 2) =>
  `C$${v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

function formatDay(day: string | null | undefined): string {
  if (!day) return "—";
  const [y, m, d] = day.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

function perShareLabel(p: CalendarPayment): string {
  const prefix = p.currency === "USD" ? "US$" : p.currency === "CAD" ? "C$" : "";
  const digits = Math.abs(p.perShare) < 1 ? 4 : 2;
  return `${prefix}${p.perShare.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
}

const STATUS_LABEL: Record<CalendarPayment["status"], string> = {
  received: "Received",
  announced: "Announced",
  projected: "Projected",
};

interface ChartRow {
  month: string;
  label: string;
  received: number;
  expected: number;
}

function CalendarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartRow }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover p-2.5 shadow-md">
      <p className="mb-1 text-xs font-medium text-foreground">{monthLabel(row.month)}</p>
      {row.received !== 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2.5 rounded-sm bg-chart-1" />
          Received <span className="ml-auto pl-3 font-mono text-foreground">{cad(row.received)}</span>
        </p>
      )}
      {row.expected !== 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <HatchSwatch />
          Expected <span className="ml-auto pl-3 font-mono text-foreground">{cad(row.expected)}</span>
        </p>
      )}
      {row.received === 0 && row.expected === 0 && <p className="text-xs text-muted-foreground">No dividends</p>}
    </div>
  );
}

function HatchSwatch() {
  return (
    <span
      className="size-2.5 shrink-0 rounded-sm border border-chart-1"
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, var(--chart-1) 0 1.5px, transparent 1.5px 4px)",
      }}
    />
  );
}

function PaymentsTable({ payments }: { payments: CalendarPayment[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-[12.5px]">
        <thead>
          <tr className="border-b border-border text-[11.5px] text-muted-foreground">
            <th className="px-3.5 py-1.5 text-left font-medium">Symbol</th>
            <th className="px-3.5 py-1.5 text-left font-medium">Ex-date</th>
            <th className="px-3.5 py-1.5 text-left font-medium">Pay date</th>
            <th className="px-3.5 py-1.5 text-right font-medium">Per share</th>
            <th className="px-3.5 py-1.5 text-right font-medium">Shares</th>
            <th className="px-3.5 py-1.5 text-right font-medium">Amount</th>
            <th className="px-3.5 py-1.5 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p, i) => (
            <tr key={`${p.symbol}-${p.payDate ?? p.exDate}-${i}`} className="border-b border-border last:border-b-0">
              <td className="px-3.5 py-1.5 whitespace-nowrap font-semibold text-foreground">{p.symbol}</td>
              <td className="px-3.5 py-1.5 whitespace-nowrap font-mono text-muted-foreground">{formatDay(p.exDate)}</td>
              <td className="px-3.5 py-1.5 whitespace-nowrap font-mono text-muted-foreground">
                {p.payDate ? (
                  <span title={p.payDateEstimated ? "Estimated from this symbol's usual ex-date to pay-date gap" : undefined}>
                    {p.payDateEstimated ? "~" : ""}
                    {formatDay(p.payDate)}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3.5 py-1.5 text-right font-mono text-foreground">{perShareLabel(p)}</td>
              <td className="px-3.5 py-1.5 text-right font-mono text-muted-foreground">
                {p.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </td>
              <td className="px-3.5 py-1.5 text-right font-mono font-medium text-foreground">{cad(p.amountCad)}</td>
              <td className="px-3.5 py-1.5 text-right">
                <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {STATUS_LABEL[p.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthRow({ m, current, open, onToggle }: { m: CalendarMonth; current: boolean; open: boolean; onToggle: () => void }) {
  const hasPayments = m.payments.length > 0;
  return (
    <Fragment>
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasPayments}
        aria-expanded={hasPayments ? open : undefined}
        className={cn(
          "grid w-full grid-cols-[1rem_minmax(0,1fr)_auto_auto] items-center gap-x-3 border-b border-border px-4 py-2 text-left text-[13px] transition-colors sm:grid-cols-[1rem_minmax(0,1fr)_7rem_7rem_5rem]",
          hasPayments ? "hover:bg-accent" : "cursor-default"
        )}
      >
        <ChevronRight
          className={cn(
            "size-3.5 text-subtle-foreground transition-transform",
            open && "rotate-90",
            !hasPayments && "invisible"
          )}
        />
        <span className={cn("text-foreground", current && "font-semibold")}>
          {monthLabel(m.month)}
          {current && <span className="ml-2 text-[11px] font-normal text-subtle-foreground">This month</span>}
        </span>
        <span className="text-right font-mono text-foreground">
          {m.received !== 0 ? cad(m.received) : <span className="text-subtle-foreground">—</span>}
        </span>
        <span className="text-right font-mono text-foreground">
          {m.upcoming ? (m.expected !== 0 ? cad(m.expected) : <span className="text-subtle-foreground">—</span>) : ""}
        </span>
        <span className="hidden text-right text-xs text-subtle-foreground sm:block">
          {hasPayments ? `${m.payments.length} payment${m.payments.length === 1 ? "" : "s"}` : ""}
        </span>
      </button>
      {open && hasPayments && (
        <div className="border-b border-border bg-background">
          <PaymentsTable payments={m.payments} />
        </div>
      )}
    </Fragment>
  );
}

export function DividendCalendar({ portfolioId }: { portfolioId?: number | string }) {
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState(false);
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const qs = portfolioId != null && portfolioId !== "" ? `?portfolioId=${portfolioId}` : "";
    fetch(`/api/dividend-calendar${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: CalendarData) => {
        if (cancelled) return;
        setData(json);
        setOpenMonths(new Set([json.currentMonth]));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [portfolioId]);

  const chartData = useMemo<ChartRow[]>(
    () =>
      (data?.months ?? []).map((m, i) => ({
        month: m.month,
        label: tickLabel(m.month, i),
        received: m.received,
        expected: m.expected,
      })),
    [data]
  );

  // Recharts passes the index among *rendered* ticks, so look labels up by value.
  const labelByMonth = useMemo(() => new Map(chartData.map((r) => [r.month, r.label])), [chartData]);

  const toggle = (month: string) =>
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });

  return (
    <Panel>
      <PanelHeader
        title="Income calendar"
        meta="past 12 · next 12 months"
        right={
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-chart-1" />
              Received
            </span>
            <span className="flex items-center gap-1.5">
              <HatchSwatch />
              Expected
            </span>
          </div>
        }
      />

      {error ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">Couldn&apos;t load the dividend calendar.</div>
      ) : !data ? (
        <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">Loading calendar…</div>
      ) : (
        <>
          <div className="space-y-1 px-4 pt-3 text-[13px] text-muted-foreground">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="whitespace-nowrap">
                Received last 12 months{" "}
                <span className="font-mono font-semibold text-foreground">{cad(data.totals.last12Received)}</span>
              </span>
              <span className="text-subtle-foreground max-sm:hidden">·</span>
              <span className="whitespace-nowrap">
                Expected next 12 months{" "}
                <span className="font-mono font-semibold text-foreground">{cad(data.totals.next12Expected)}</span>
                <InfoTip text="Expected repeats each holding's last 12 months of dividends one year on, at today's share count, replaced by the announced payment where one is known. Months are by pay date where known or estimated, else ex-date. USD converted at today's rate." />
              </span>
            </p>
            {data.missing.length > 0 && (
              <p className="text-xs text-subtle-foreground">
                {data.missing.length} symbol{data.missing.length === 1 ? "" : "s"} unavailable ({data.missing.join(", ")}) —
                expected income may be understated.
              </p>
            )}
          </div>

          <div className="px-2 pt-2 pb-1 sm:px-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={chartData}
                margin={{ top: 16, right: 4, left: 0, bottom: 0 }}
                barCategoryGap="18%"
                onClick={(state) => {
                  const idx = Number(state?.activeTooltipIndex);
                  const month = Number.isInteger(idx) ? chartData[idx]?.month : undefined;
                  if (month && !openMonths.has(month)) toggle(month);
                }}
              >
                <defs>
                  <pattern id={HATCH_ID} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                    <rect width="5" height="5" fill="var(--card)" />
                    <line x1="0" y1="0" x2="0" y2="5" stroke="var(--chart-1)" strokeWidth="2" />
                  </pattern>
                </defs>
                <ReferenceArea
                  x1={data.currentMonth}
                  x2={data.currentMonth}
                  fill="var(--muted)"
                  fillOpacity={1}
                  label={{ value: "Now", position: "top", fontSize: 10, fill: "var(--muted-foreground)" }}
                />
                <XAxis
                  dataKey="month"
                  tickFormatter={(month: string) => labelByMonth.get(month) ?? ""}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10.5 }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={6}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10.5 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v: number) => (v >= 1000 ? `C$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `C$${v}`)}
                />
                <Tooltip content={<CalendarTooltip />} cursor={{ fill: "var(--accent)" }} />
                <Bar dataKey="received" stackId="m" fill="var(--chart-1)" maxBarSize={28} isAnimationActive={false} />
                <Bar
                  dataKey="expected"
                  stackId="m"
                  fill={`url(#${HATCH_ID})`}
                  stroke="var(--chart-1)"
                  strokeWidth={1}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="border-t border-border">
            <div className="grid grid-cols-[1rem_minmax(0,1fr)_auto_auto] gap-x-3 border-b border-border px-4 py-1.5 text-[11.5px] font-medium text-muted-foreground sm:grid-cols-[1rem_minmax(0,1fr)_7rem_7rem_5rem]">
              <span />
              <span>Month</span>
              <span className="text-right">Received</span>
              <span className="text-right">Expected</span>
              <span className="hidden sm:block" />
            </div>
            {data.months.map((m) => (
              <MonthRow
                key={m.month}
                m={m}
                current={m.month === data.currentMonth}
                open={openMonths.has(m.month)}
                onToggle={() => toggle(m.month)}
              />
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
