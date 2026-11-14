import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | undefined, currency = "USD"): string {
  if (value === undefined) return "-";
  const fixed = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  if (currency === "USD" || currency === "CAD") {
    const symbol = currency === "CAD" ? "C$" : "US$";
    return `${symbol}${value.toLocaleString(undefined, fixed)}`;
  }
  // Yahoo quotes LSE lines in pence ("GBp"); a pound sign would be off by 100x.
  if (currency === "GBp" || currency === "GBX") {
    return `${value.toLocaleString(undefined, fixed)}p`;
  }
  try {
    return value.toLocaleString(undefined, { ...fixed, style: "currency", currency });
  } catch {
    // Not an ISO 4217 code: print the code rather than a misleading "$".
    return `${value.toLocaleString(undefined, fixed)} ${currency}`;
  }
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
  // Normalise after rounding so -0.001 prints "+0.00%", not "-0.00%".
  const rounded = Number(value.toFixed(2)) || 0;
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(2)}%`;
}

/** Positive/negative for direction; exactly zero (or no value) has none. */
export function getChangeColor(value: number | null | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value) || value === 0) {
    return "text-muted-foreground";
  }
  return value > 0 ? "text-positive" : "text-negative";
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

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The calendar day a stored date stands for, as YYYY-MM-DD.
 *
 * Date-only strings (ex-dividend and pay dates) already are one. Transaction
 * dates are calendar days stored as instants at 12:00 UTC (older manual rows
 * at 00:00 UTC), so their day is the UTC date, never the browser's local one:
 * in Toronto 00:00Z is still the previous evening.
 */
export function toCalendarDate(value: string | Date): string {
  if (typeof value === "string" && DATE_ONLY.test(value)) return value;
  return new Date(value).toISOString().slice(0, 10);
}

/** A local-midnight Date for a calendar day, safe to format or compare in local time. */
export function parseCalendarDate(value: string | Date): Date {
  const [, y, m, d] = DATE_ONLY.exec(toCalendarDate(value))!;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/** Today's (or the given instant's) date in the browser's own timezone, as YYYY-MM-DD. */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format a calendar date (YYYY-MM-DD, or a transaction instant) as "Dec 1, 2026". */
export function formatDate(value: string | undefined): string {
  if (!value) return "-";
  return parseCalendarDate(value).toLocaleDateString(undefined, {
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
