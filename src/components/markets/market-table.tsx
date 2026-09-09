"use client";

import { ArrowLeftRight, Bell, Pencil } from "lucide-react";
import { MarketData } from "@/types";
import { MarketRange } from "@/lib/markets/ranges";
import { parsePairSymbol } from "@/lib/markets/catalog";
import { formatPercent, getChangeColor } from "@/lib/utils";
import { Sparkline } from "./sparkline";
import { ExtendedHoursLabel } from "@/components/ui/extended-hours-label";
import { PriceRangeBar } from "@/components/ui/price-range-bar";
import { alertBellClass, formatMarketChange, formatMarketPrice, type AlertState } from "./market-format";

interface MarketTableProps {
  title: string;
  items: MarketData[];
  /** The timeframe the Chg and % columns are measured over. */
  range: MarketRange;
  onSelect?: (symbol: string) => void;
  onChartClick?: (symbol: string) => void;
  alertStates?: Record<string, AlertState>;
  onAlertClick?: (symbol: string) => void;
  /** Opens the row picker on this section. Also makes the heading a control. */
  onEdit?: () => void;
  /** Reverses a currency pair, e.g. USD/CAD to CAD/USD. */
  onFlip?: (symbol: string) => void;
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
  range,
  onSelect,
  onChartClick,
  alertStates,
  onAlertClick,
  onEdit,
  onFlip,
}: MarketTableProps) {
  // Without a way in, a section emptied from the picker would be unreachable.
  if (items.length === 0 && !onEdit) return null;

  const heading = onEdit ? (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Edit ${title} rows`}
      className="mb-2 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
    >
      {title}
      <Pencil className="size-3.5" />
    </button>
  ) : (
    <h3 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h3>
  );

  if (items.length === 0) {
    return (
      <section>
        {heading}
        <p className="border-t border-border py-3 text-[13px] text-muted-foreground">
          No rows. Choose some from the heading above.
        </p>
      </section>
    );
  }

  return (
    <section>
      {heading}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className={`${headerCell} text-left`}>Name</th>
              <th className={`${headerCell} text-right`}>Price</th>
              <th className={`${headerCell} text-right`}>{range} Chg</th>
              <th className={`${headerCell} text-right`}>{range} %</th>
              <th className={`${headerCell} text-center`}>{range} Range</th>
              <th className={`${headerCell} text-right`}>Trend</th>
              <th className={`${headerCell} text-right ${onFlip ? "w-16" : "w-10"}`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((data) => {
              const positive = data.rangeChange >= 0;
              const changeColor = getChangeColor(data.rangeChange);
              const pair = onFlip ? parsePairSymbol(data.symbol) : null;
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
                      <span
                        className="text-[13px] font-medium text-foreground"
                        title={data.description}
                      >
                        {data.name}
                      </span>
                      <span className="text-[11px] text-subtle-foreground">
                        {data.short ? `${data.symbol} · ${data.short}` : data.symbol}
                      </span>
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
                      {formatMarketChange(data.rangeChange, data.symbol, data.price)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className={`font-mono text-[12.5px] ${getChangeColor(data.rangeChangePercent)}`}>
                      {formatPercent(data.rangeChangePercent)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {data.rangeLow !== undefined && data.rangeHigh !== undefined && (
                      <div className="mx-auto w-28">
                        <PriceRangeBar
                          low={data.rangeLow}
                          high={data.rangeHigh}
                          current={data.price}
                          size="xs"
                          format={(value) => formatMarketPrice(value, data.symbol)}
                        />
                      </div>
                    )}
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
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      {pair && (
                        <button
                          type="button"
                          className="rounded p-1 text-subtle-foreground transition-colors hover:bg-accent hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFlip?.(data.symbol);
                          }}
                          aria-label={`Show as ${pair.quote}/${pair.base}`}
                          title={`Show as ${pair.quote}/${pair.base}`}
                        >
                          <ArrowLeftRight className="size-3.5" />
                        </button>
                      )}
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
                    </div>
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
