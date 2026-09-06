"use client";

import { Bell } from "lucide-react";
import { MarketData } from "@/types";
import { formatPercent, getChangeColor } from "@/lib/utils";
import { Sparkline } from "./sparkline";
import { ExtendedHoursLabel } from "@/components/ui/extended-hours-label";
import { alertBellClass, formatMarketChange, formatMarketPrice, type AlertState } from "./market-format";

interface MarketTableProps {
  title: string;
  items: MarketData[];
  onSelect?: (symbol: string) => void;
  onChartClick?: (symbol: string) => void;
  alertStates?: Record<string, AlertState>;
  onAlertClick?: (symbol: string) => void;
}

const headerCell = "px-3 py-2 text-[11.5px] font-medium text-muted-foreground";

/**
 * The demoted half of the Markets panel: everything outside the four headline
 * indices, as compact rows. Rows absorb odd counts without the orphan gaps a
 * four-column card grid leaves behind.
 */
export function MarketTable({
  title,
  items,
  onSelect,
  onChartClick,
  alertStates,
  onAlertClick,
}: MarketTableProps) {
  if (items.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className={`${headerCell} text-left`}>Name</th>
              <th className={`${headerCell} text-right`}>Price</th>
              <th className={`${headerCell} text-right`}>Chg</th>
              <th className={`${headerCell} text-right`}>%</th>
              <th className={`${headerCell} text-right`}>Trend</th>
              <th className={`${headerCell} w-10 text-right`}>
                <span className="sr-only">Alerts</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((data) => {
              const positive = data.change >= 0;
              const changeColor = getChangeColor(data.change);
              return (
                <tr
                  key={data.symbol}
                  className={`border-b border-border transition-colors last:border-b-0 hover:bg-accent ${
                    onSelect ? "cursor-pointer" : ""
                  }`}
                  onClick={() => onSelect?.(data.symbol)}
                >
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-start">
                      <span className="text-[13px] font-medium text-foreground">{data.name}</span>
                      <span className="text-[11px] text-subtle-foreground">{data.symbol}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className="font-mono text-[13px] font-medium text-foreground">
                      {formatMarketPrice(data.price, data.symbol)}
                    </span>
                    {data.extendedHours && (
                      <ExtendedHoursLabel extendedHours={data.extendedHours} compact />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className={`font-mono text-[12.5px] ${changeColor}`}>
                      {formatMarketChange(data.change, data.symbol)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className={`font-mono text-[12.5px] ${getChangeColor(data.changePercent)}`}>
                      {formatPercent(data.changePercent)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end">
                      {data.sparklineData.length >= 2 ? (
                        onChartClick ? (
                          <button
                            type="button"
                            className="-m-1 cursor-pointer rounded p-1 transition-colors hover:bg-muted"
                            onClick={(e) => {
                              e.stopPropagation();
                              onChartClick(data.symbol);
                            }}
                            title="View chart"
                          >
                            <Sparkline data={data.sparklineData} positive={positive} width={56} height={18} />
                          </button>
                        ) : (
                          <Sparkline data={data.sparklineData} positive={positive} width={56} height={18} />
                        )
                      ) : (
                        <div style={{ width: 56, height: 18 }} />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {onAlertClick && (
                      <button
                        type="button"
                        className={`rounded p-1 transition-colors ${alertBellClass(alertStates?.[data.symbol])}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAlertClick(data.symbol);
                        }}
                        aria-label={`Manage alerts for ${data.name}`}
                      >
                        <Bell
                          className={`size-3.5 ${
                            alertStates?.[data.symbol]?.triggered
                              ? "animate-[bell-ring_2s_ease-in-out_infinite] origin-top"
                              : ""
                          }`}
                        />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
