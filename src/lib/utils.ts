import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Convert UTC Unix timestamp to Eastern Time for chart display */
export function toEasternTime(utcTimestamp: number): number {
  const date = new Date(utcTimestamp * 1000);
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const etDate = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const offset = etDate.getTime() - utcDate.getTime();
  return Math.floor(utcTimestamp + offset / 1000);
}
