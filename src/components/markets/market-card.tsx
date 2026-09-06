import { Bell } from "lucide-react";
import { MarketData } from "@/types";
import { Sparkline } from "./sparkline";
import { ExtendedHoursLabel } from "@/components/ui/extended-hours-label";

interface MarketCardProps {
  data: MarketData;
  onClick?: () => void;
  onChartClick?: () => void;
  alertState?: { hasRules: boolean; triggered: boolean };
  onAlertClick?: () => void;
}

export function MarketCard({ data, onClick, onChartClick, alertState, onAlertClick }: MarketCardProps) {
  const isPositive = data.change >= 0;
  const changeColor = isPositive ? "text-positive" : "text-negative";

  const isCurrency = data.symbol.includes("=X");

  const formatPrice = (price: number) => {
    if (isCurrency) {
      return price.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    }
    if (price >= 10000) {
      return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatChange = (change: number) => {
    const sign = change >= 0 ? "+" : "";
    const decimals = isCurrency ? 3 : 2;
    return `${sign}${change.toFixed(decimals)}`;
  };

  const formatPercent = (percent: number) => {
    const sign = percent >= 0 ? "+" : "";
    return `${sign}${percent.toFixed(2)}%`;
  };

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
                className={`shrink-0 rounded p-1 transition-colors ${(() => {
                  if (alertState?.triggered) return "text-negative hover:bg-negative/10";
                  if (alertState?.hasRules) return "text-positive hover:bg-positive/10";
                  return "text-subtle-foreground hover:bg-accent hover:text-foreground";
                })()}`}
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
          {formatPrice(data.price)}
        </span>
        <div className="text-right">
          <span className={`text-sm font-medium ${changeColor}`}>
            {formatChange(data.change)}
          </span>
          <span className={`block text-xs ${changeColor}`}>
            {formatPercent(data.changePercent)}
          </span>
        </div>
      </div>
      {data.extendedHours && (
        <div className="mt-1.5">
          <ExtendedHoursLabel extendedHours={data.extendedHours} compact />
        </div>
      )}
    </div>
  );
}
