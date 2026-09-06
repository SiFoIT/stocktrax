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
        <div className="relative h-1.5 rounded-full bg-muted">
          <div
            className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary"
            style={{ left: `calc(${Math.min(Math.max(position, 0), 100)}% - 5px)` }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[10.5px]">
          <span className="text-subtle-foreground">${low.toFixed(2)}</span>
          <span className="text-subtle-foreground">${high.toFixed(2)}</span>
        </div>
        {showDistance && (
          <div className="flex justify-between text-[10px] -mt-0.5">
            <span className="text-positive/70">+{aboveLow.toFixed(1)}%</span>
            <span className="text-negative/70">{offHigh === 0 ? "0.0%" : `${offHigh.toFixed(1)}%`}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="relative h-1.5 rounded-full bg-muted">
        <div
          className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `calc(${Math.min(Math.max(position, 0), 100)}% - 6px)` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10.5px]">
        <span className="text-subtle-foreground">${low.toFixed(2)}</span>
        <span className="text-subtle-foreground">${high.toFixed(2)}</span>
      </div>
    </div>
  );
}
