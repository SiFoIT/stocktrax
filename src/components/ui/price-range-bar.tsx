interface PriceRangeBarProps {
  low: number;
  current: number;
  high: number;
  compact?: boolean;
  showDistance?: boolean;
  /**
   * Track and the two distances only, with the low and high in a tooltip.
   * Full width of its container, for a row on a market card.
   */
  mini?: boolean;
  /** How to print the low and high. Defaults to a dollar figure to two places. */
  format?: (value: number) => string;
}

const dollars = (value: number) => `$${value.toFixed(2)}`;

export function PriceRangeBar({
  low,
  current,
  high,
  compact = false,
  showDistance = false,
  mini = false,
  format = dollars,
}: PriceRangeBarProps) {
  const range = high - low;
  const position = Math.min(Math.max(range > 0 ? ((current - low) / range) * 100 : 50, 0), 100);
  const aboveLow = low > 0 ? ((current - low) / low) * 100 : 0;
  const offHigh = high > 0 ? ((current - high) / high) * 100 : 0;
  const offHighLabel = offHigh === 0 ? "0.0%" : `${offHigh.toFixed(1)}%`;

  if (mini) {
    return (
      <div title={`Low ${format(low)} · High ${format(high)}`}>
        <div className="relative h-1 rounded-full bg-foreground/15">
          <div
            className="absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-primary"
            style={{ left: `calc(${position}% - 3px)` }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10.5px] leading-none">
          <span className="text-positive">+{aboveLow.toFixed(1)}%</span>
          <span className="text-negative">{offHighLabel}</span>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="w-32 mx-auto">
        <div className="relative h-1.5 rounded-full bg-foreground/15">
          <div
            className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary"
            style={{ left: `calc(${position}% - 5px)` }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[10.5px]">
          <span className="text-subtle-foreground">{format(low)}</span>
          <span className="text-subtle-foreground">{format(high)}</span>
        </div>
        {showDistance && (
          <div className="flex justify-between text-[10px] -mt-0.5">
            <span className="text-positive">+{aboveLow.toFixed(1)}%</span>
            <span className="text-negative">{offHighLabel}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="relative h-1.5 rounded-full bg-foreground/15">
        <div
          className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `calc(${position}% - 6px)` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10.5px]">
        <span className="text-subtle-foreground">{format(low)}</span>
        <span className="text-subtle-foreground">{format(high)}</span>
      </div>
    </div>
  );
}
