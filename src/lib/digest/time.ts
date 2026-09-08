/**
 * Date helpers for the digest, all working on `YYYY-MM-DD` strings in a chosen
 * IANA timezone. Kept free of `Date` arithmetic in local time: the scheduler
 * runs in whatever zone the container happens to use, which is rarely the
 * user's, and a day boundary that drifts sends the wrong digest.
 */

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Wall-clock components of `date` as rendered in `timeZone`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  // Some engines render midnight as hour 24 with hour12:false.
  const hour = get("hour") % 24;

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
  };
}

/** `YYYY-MM-DD` for `date` in `timeZone`. */
export function zonedDateStr(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** `HH:MM` for `date` in `timeZone`, comparable as a string. */
export function zonedTimeStr(date: Date, timeZone: string): string {
  const { hour, minute } = zonedParts(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Midday UTC on a date string — a safe anchor for day arithmetic. */
export function dateStrToUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function utcToDateStr(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = dateStrToUtc(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return utcToDateStr(d);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(dateStr: string): number {
  return dateStrToUtc(dateStr).getUTCDay();
}

export function weekdayName(dateStr: string): string {
  return WEEKDAY_NAMES[weekdayOf(dateStr)];
}

/**
 * The most recent Friday on or before `dateStr`. On the Saturday the weekly
 * runs this is yesterday; run manually midweek it is the previous week's
 * close, so a test send still describes a complete week.
 */
export function mostRecentFriday(dateStr: string): string {
  let cursor = dateStr;
  for (let i = 0; i < 7; i++) {
    if (weekdayOf(cursor) === 5) return cursor;
    cursor = addDays(cursor, -1);
  }
  return dateStr;
}

export interface DigestWeek {
  /** Monday of the reported week. */
  start: string;
  /** Friday of the reported week. */
  end: string;
  /** The Friday before `start`, whose close is the comparison baseline. */
  baseline: string;
}

export function digestWeek(dateStr: string): DigestWeek {
  const end = mostRecentFriday(dateStr);
  return { start: addDays(end, -4), end, baseline: addDays(end, -7) };
}

/** "Mon Sep 8, 2026" */
export function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${weekdayName(dateStr)} ${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

/** "Sep 1 – 5, 2026", collapsing the month when both ends share it. */
export function formatRangeLabel(startStr: string, endStr: string): string {
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);

  if (sy === ey && sm === em) {
    return `${MONTH_NAMES[sm - 1]} ${sd} – ${ed}, ${ey}`;
  }
  if (sy === ey) {
    return `${MONTH_NAMES[sm - 1]} ${sd} – ${MONTH_NAMES[em - 1]} ${ed}, ${ey}`;
  }
  return `${MONTH_NAMES[sm - 1]} ${sd}, ${sy} – ${MONTH_NAMES[em - 1]} ${ed}, ${ey}`;
}

/** "Mar 2021" — how the weekly names the start of the All time figure. */
export function formatMonthLabel(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}
