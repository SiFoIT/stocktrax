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
  const changeColor = isPositive ? "text-green-500" : "text-red-500";
  const bgGradient = isPositive
    ? "from-green-500/5 to-transparent"
    : "from-red-500/5 to-transparent";

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
      className={`rounded-xl border border-black/10 dark:border-white/10 bg-gradient-to-br ${bgGradient} p-4 transition-all hover:border-black/20 dark:hover:border-white/20 hover:shadow-lg ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-black dark:text-white truncate">{data.name}</h3>
            {onAlertClick && (
              <button
                className={`p-1 rounded-lg transition-colors shrink-0 ${(() => {
                  if (alertState?.triggered) return "text-red-500 hover:bg-red-500/10";
                  if (alertState?.hasRules) return "text-emerald-500 hover:bg-emerald-500/10";
                  return "text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5";
                })()}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAlertClick();
                }}
                aria-label="Manage alerts"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
            )}
          </div>
          <p className="text-xs text-black/50 dark:text-white/50">{data.symbol}</p>
        </div>
        <div className="shrink-0">
          {data.sparklineData.length >= 2 && (
            onChartClick ? (
              <button
                className={`rounded-lg p-1 -m-1 transition-transform cursor-pointer hover:scale-105 ${isPositive ? "hover:drop-shadow-[0_0_4px_rgba(34,197,94,0.5)]" : "hover:drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]"}`}
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
        <span className="text-xl font-bold text-black dark:text-white">
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
