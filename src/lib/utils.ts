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

export function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function getChangeColor(value: number | undefined): string {
  if (value === undefined) return "text-black/50 dark:text-white/50";
  return value >= 0 ? "text-emerald-400" : "text-red-400";
}

export function getChangeBg(value: number | undefined): string {
  if (value === undefined) return "bg-black/5 dark:bg-white/5";
  return value >= 0 ? "bg-emerald-500/10" : "bg-red-500/10";
}

/** Convert UTC Unix timestamp to Eastern Time for chart display */
export function toEasternTime(utcTimestamp: number): number {
  const date = new Date(utcTimestamp * 1000);
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const etDate = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const offset = etDate.getTime() - utcDate.getTime();
  return Math.floor(utcTimestamp + offset / 1000);
}
