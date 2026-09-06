import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | undefined, currency = "USD"): string {
  if (value === undefined) return "-";
  const symbol = currency === "CAD" ? "C$" : currency === "USD" ? "US$" : "$";
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Convert a native-currency value to CAD using a USD→CAD rate.
 * USD values are multiplied by the rate; CAD (or anything non-USD) passes
 * through unchanged. Mirrors the server-side conversion in the portfolio
 * summary route so client tables can total mixed-currency holdings correctly.
 */
export function toCAD(value: number, currency: string | undefined, usdCadRate: number): number {
  return currency === "USD" ? value * usdCadRate : value;
}

export function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function getChangeColor(value: number | undefined): string {
  if (value === undefined) return "text-muted-foreground";
  return value >= 0 ? "text-positive" : "text-negative";
}

export function getChangeBg(value: number | undefined): string {
  if (value === undefined) return "bg-muted";
  return value >= 0 ? "bg-positive/10" : "bg-negative/10";
}

/** Format a ratio (0-1) as percentage, e.g. 0.5 -> "50.00%" */
export function formatPercentRatio(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

export function formatVolume(value: number | undefined, decimals = 1): string {
  if (value === undefined) return "-";
  if (value >= 1e9) return `${(value / 1e9).toFixed(decimals)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(decimals)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(decimals)}K`;
  return value.toFixed(0);
}

export function formatTradeTime(isoString: string | undefined): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatUpdatedTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return "Updated just now";
  } else if (diffMins < 60) {
    return `Updated ${diffMins} min ago`;
  } else {
    return `Updated ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
}

export function formatDate(value: string | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Convert UTC Unix timestamp to Eastern Time for chart display */
export function toEasternTime(utcTimestamp: number): number {
  const date = new Date(utcTimestamp * 1000);
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const etDate = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const offset = etDate.getTime() - utcDate.getTime();
  return Math.floor(utcTimestamp + offset / 1000);
}
