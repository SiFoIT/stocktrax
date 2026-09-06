import { ExtendedHoursData } from "@/types";

interface ExtendedHoursLabelProps {
  extendedHours?: ExtendedHoursData;
  currency?: string;
  compact?: boolean;
}

function formatPrice(price: number, currency = "USD") {
  return price.toLocaleString(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number | undefined) {
  if (value === undefined || value === null) return "";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function ExtendedHoursLabel({ extendedHours, currency = "USD", compact }: ExtendedHoursLabelProps) {
  if (!extendedHours?.marketState) return null;

  const state = extendedHours.marketState;

  // During regular hours, show nothing
  if (state === "REGULAR") return null;

  let label: string;
  let price: number | undefined;
  let changePercent: number | undefined;

  if ((state === "PRE" || state === "PREPRE") && extendedHours.preMarketPrice != null) {
    label = "Pre:";
    price = extendedHours.preMarketPrice;
    changePercent = extendedHours.preMarketChangePercent;
  } else if ((state === "POST" || state === "POSTPOST" || state === "CLOSED") && extendedHours.postMarketPrice != null) {
    label = state === "CLOSED" ? "After:" : "Post:";
    price = extendedHours.postMarketPrice;
    changePercent = extendedHours.postMarketChangePercent;
  } else {
    return null;
  }

  const isPositive = (changePercent ?? 0) >= 0;
  const changeColor = isPositive ? "text-positive" : "text-negative";

  if (compact) {
    return (
      <div className="flex items-center gap-1 text-[10px] leading-tight">
        <span className="text-warning font-medium">{label}</span>
        <span className="text-muted-foreground font-mono">{formatPrice(price, currency)}</span>
        <span className={changeColor}>{formatPercent(changePercent)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-warning font-medium">{label}</span>
      <span className="text-muted-foreground font-mono">{formatPrice(price, currency)}</span>
      <span className={changeColor}>{formatPercent(changePercent)}</span>
    </div>
  );
}
