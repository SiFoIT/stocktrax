import { MarketData } from "@/types";
import { Sparkline } from "./sparkline";
import { ExtendedHoursLabel } from "@/components/ui/extended-hours-label";

interface MarketCardProps {
  data: MarketData;
  onClick?: () => void;
  onChartClick?: () => void;
}

export function MarketCard({ data, onClick, onChartClick }: MarketCardProps) {
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
          <h3 className="font-semibold text-black dark:text-white truncate">{data.name}</h3>
          <p className="text-xs text-black/50 dark:text-white/50">{data.symbol}</p>
        </div>
        {data.sparklineData.length >= 2 && (
          onChartClick ? (
            <button
              className="rounded-lg p-1 -m-1 transition-colors hover:bg-white/10 dark:hover:bg-white/10 hover:shadow-sm cursor-pointer"
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
