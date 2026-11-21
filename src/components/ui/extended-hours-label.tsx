import { ExtendedHoursData } from "@/types";
import { selectExtendedHours } from "@/lib/extended-hours";

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
  // The same selection the index tiles use, so "After:" means one thing.
  const move = selectExtendedHours(extendedHours);
  if (!move) return null;
  const { label, price, changePercent } = move;

  const pct = changePercent ?? 0;
  const changeColor = pct > 0 ? "text-positive" : pct < 0 ? "text-negative" : "text-muted-foreground";

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
