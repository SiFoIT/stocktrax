interface PriceRangeBarProps {
  low: number;
  current: number;
  high: number;
  compact?: boolean;
  showDistance?: boolean;
}

export function PriceRangeBar({ low, current, high, compact = false, showDistance = false }: PriceRangeBarProps) {
  const range = high - low;
  const position = range > 0 ? ((current - low) / range) * 100 : 50;

  if (compact) {
    const aboveLow = low > 0 ? ((current - low) / low) * 100 : 0;
    const offHigh = high > 0 ? ((current - high) / high) * 100 : 0;

    return (
      <div className="w-32 mx-auto">
        <div className="relative h-2 bg-gradient-to-r from-red-500/40 via-yellow-500/40 to-emerald-500/40 rounded-full">
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow border-2 border-blue-500"
            style={{ left: `calc(${Math.min(Math.max(position, 0), 100)}% - 5px)` }}
          />
        </div>
        <div className="flex justify-between text-[11px] mt-0.5">
          <span className="text-red-400">${low.toFixed(2)}</span>
          <span className="text-emerald-400">${high.toFixed(2)}</span>
        </div>
        {showDistance && (
          <div className="flex justify-between text-[10px] -mt-0.5">
            <span className="text-emerald-400/70">+{aboveLow.toFixed(1)}%</span>
            <span className="text-red-400/70">{offHigh === 0 ? "0.0%" : `${offHigh.toFixed(1)}%`}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="relative h-2 bg-gradient-to-r from-red-500/30 via-yellow-500/30 to-emerald-500/30 rounded-full">
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg border-2 border-blue-500"
          style={{ left: `calc(${Math.min(Math.max(position, 0), 100)}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between text-xs mt-1">
        <span className="text-red-400">${low.toFixed(2)}</span>
        <span className="text-emerald-400">${high.toFixed(2)}</span>
      </div>
    </div>
  );
}
