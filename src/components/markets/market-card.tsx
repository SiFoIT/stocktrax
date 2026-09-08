import { Bell } from "lucide-react";
import { MarketData } from "@/types";
import { formatPercent, getChangeColor } from "@/lib/utils";
import { Sparkline } from "./sparkline";
import { PriceRangeBar } from "@/components/ui/price-range-bar";
import {
  alertBellClass,
  formatMarketChange,
  formatMarketPrice,
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
      <div className="flex items-end justify-between">
        <span className="text-lg font-semibold tracking-tight text-foreground">
          {formatMarketPrice(data.price, data.symbol)}
        </span>
        <div className="text-right">
          <span className={`text-sm font-medium ${changeColor}`}>
            {formatMarketChange(data.rangeChange, data.symbol)}
          </span>
          <span className={`block text-xs ${changeColor}`}>
            {formatPercent(data.rangeChangePercent)}
          </span>
        </div>
      </div>
      {/* Where the price sits inside the selected range's low and high. */}
      {data.rangeLow !== undefined && data.rangeHigh !== undefined && (
        <div className="mt-2.5">
          <PriceRangeBar
            low={data.rangeLow}
            high={data.rangeHigh}
            current={data.price}
            mini
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
            <span className="text-muted-foreground">{data.futures.label}</span>
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
