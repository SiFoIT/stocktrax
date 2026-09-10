import { Bell } from "lucide-react";
import { MarketData } from "@/types";
import { formatPercent, getChangeColor } from "@/lib/utils";
import { Sparkline } from "./sparkline";
import { PriceRangeBar } from "@/components/ui/price-range-bar";
import {
  alertBellClass,
  formatMarketPrice,
  futuresCode,
  futuresTooltip,
  showFutures,
  type AlertState,
} from "./market-format";

interface MarketCardProps {
  data: MarketData;
  onClick?: () => void;
  onChartClick?: () => void;
  alertState?: AlertState;
  onAlertClick?: () => void;
}

export function MarketCard({ data, onClick, onChartClick, alertState, onAlertClick }: MarketCardProps) {
  const isPositive = data.rangeChange >= 0;
  const changeColor = isPositive ? "text-positive" : "text-negative";

  return (
    <div
      className={`rounded-md border border-border bg-card p-3 transition-colors hover:border-border-strong ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-medium text-foreground">{data.name}</h3>
            {onAlertClick && (
              <button
                className={`shrink-0 rounded p-1 transition-colors ${alertBellClass(alertState)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAlertClick();
                }}
                aria-label="Manage alerts"
              >
                <Bell className={`size-3.5 ${alertState?.triggered ? "animate-[bell-ring_2s_ease-in-out_infinite] origin-top" : ""}`} />
              </button>
            )}
          </div>
          <p className="text-xs text-subtle-foreground">{data.symbol}</p>
        </div>
        <div className="shrink-0">
          {data.sparklineData.length >= 2 && (
            onChartClick ? (
              <button
                className="-m-1 cursor-pointer rounded border border-border p-1 transition-colors hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onChartClick();
                }}
                title="View chart"
              >
                <Sparkline data={data.sparklineData} positive={isPositive} />
              </button>
            ) : (
              <Sparkline data={data.sparklineData} positive={isPositive} />
            )
          )}
        </div>
      </div>
      {/*
        Value left, percent right, both at the same weight — the same line the
        mover tiles run at the top of the page. The absolute change is left to
        the details modal; the percent is what compares across four indices
        priced on completely different scales.

        Two columns on a 375px phone leave the card about 133px, which an
        eight-digit index and its percent just outgrow. `flex-wrap` drops the
        percent to its own row only at the widths where it did not fit, so
        every wider screen keeps the single line it already had. The percent
        carries `ml-auto` so it stays hard right either way: on one line the
        auto margin absorbs the same gap `justify-between` did.
      */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-lg font-semibold tracking-tight text-foreground">
          {formatMarketPrice(data.price, data.symbol)}
        </span>
        <span className={`ml-auto text-lg font-semibold tracking-tight ${changeColor}`}>
          {formatPercent(data.rangeChangePercent)}
        </span>
      </div>
      {/* Where the price sits inside the selected range's low and high. */}
      {data.rangeLow !== undefined && data.rangeHigh !== undefined && (
        <div className="mt-2.5">
          <PriceRangeBar
            low={data.rangeLow}
            high={data.rangeHigh}
            current={data.price}
            size="xs"
            format={(value) => formatMarketPrice(value, data.symbol)}
          />
        </div>
      )}
      {/*
        Always occupies a line so the card does not resize at 9:30 when the
        futures quote drops away.
      */}
      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
        {showFutures(data) && data.futures ? (
          <span className="flex items-center gap-1.5" title={futuresTooltip(data.futures)}>
            <span className="text-muted-foreground">{futuresCode(data.futures)}</span>
            <span className={getChangeColor(data.futures.changePercent)}>
              {formatPercent(data.futures.changePercent)}
            </span>
          </span>
        ) : (
          <span>&nbsp;</span>
        )}
      </div>
    </div>
  );
}
