interface PriceRangeBarProps {
  low: number;
  current: number;
  high: number;
  /**
   * Three sizes of one layout:
   * - `xs` market table rows and the promoted index cards
   * - `sm` the watchlist and portfolio performance tables
   * - `md` the stock details modal
   */
  size?: "xs" | "sm" | "md";
  /** Caption above the values, e.g. "52-Week Range". */
  label?: string;
  /** How to print the low and high. Defaults to a dollar figure to two places. */
  format?: (value: number) => string;
}

const dollars = (value: number) => `$${value.toFixed(2)}`;

/**
 * Where a price sits between a low and a high. Every size renders the same
 * three lines — low and high above the track, the track, then the distance
 * above the low and off the high — so the anatomy reads the same everywhere.
 */
const SIZES = {
  xs: {
    track: "h-1",
    marker: "size-1.5",
    /** Half the marker, so the dot centres on its position. */
    offset: 3,
    values: "font-mono text-[10.5px] leading-none",
    distances: "font-mono text-[10.5px] leading-none",
  },
  sm: {
    track: "h-1.5",
    marker: "size-2",
    offset: 4,
    values: "text-[10.5px] leading-none",
    distances: "text-[10px] leading-none",
  },
  md: {
    track: "h-1.5",
    marker: "size-2.5",
    offset: 5,
    values: "text-xs",
    distances: "text-xs",
  },
} as const;

export function PriceRangeBar({
  low,
  current,
  high,
  size = "md",
  label,
  format = dollars,
}: PriceRangeBarProps) {
  const range = high - low;
  const position = Math.min(Math.max(range > 0 ? ((current - low) / range) * 100 : 50, 0), 100);
  const aboveLow = low > 0 ? ((current - low) / low) * 100 : 0;
  const offHigh = high > 0 ? ((current - high) / high) * 100 : 0;
  const offHighLabel = offHigh === 0 ? "0.0%" : `${offHigh.toFixed(1)}%`;
  const style = SIZES[size];

  return (
    <div className={size === "md" ? "py-2" : size === "sm" ? "mx-auto w-32" : undefined}>
      {label && <div className="mb-1 text-xs text-muted-foreground">{label}</div>}
      <div className={`mb-1 flex justify-between text-subtle-foreground ${style.values}`}>
        <span>{format(low)}</span>
        <span>{format(high)}</span>
      </div>
      <div className={`relative rounded-full bg-foreground/15 ${style.track}`}>
        <div
          className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-primary ${style.marker}`}
          style={{ left: `calc(${position}% - ${style.offset}px)` }}
        />
      </div>
      <div className={`mt-1 flex justify-between ${style.distances}`}>
        <span className="text-positive">+{aboveLow.toFixed(1)}%</span>
        <span className="text-negative">{offHighLabel}</span>
      </div>
    </div>
  );
}
