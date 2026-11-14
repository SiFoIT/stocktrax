/**
 * Pure return math shared by the dashboard summary and the email digest.
 *
 * Everything here works on calendar-day strings ("YYYY-MM-DD") in the
 * exchange's own timezone, never on raw instants: Yahoo stamps a daily bar at
 * the session open, so comparing instants silently picks the wrong session.
 */
import { isTradingDay, isTsxTradingDay } from "@/lib/markets/calendar";
import { addDays } from "@/lib/digest/time";

/** One daily bar, keyed by the exchange-local trading day. */
export interface DailyBar {
  day: string;
  close: number;
}

/** A split on `day`: each pre-split share became `ratio` shares. */
export interface Split {
  day: string;
  ratio: number;
}

/** Close of the last bar on or before `day`, or null when none is that old. */
export function closeOnOrBeforeDay(bars: DailyBar[], day: string): number | null {
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].day <= day) return bars[i].close;
  }
  return null;
}

/**
 * How many of today's shares one share held at the close of `day` became.
 * Yahoo's daily closes are split-adjusted into today's share units, so a
 * position counted from the transaction ledger before a split must be scaled
 * by this before it is priced against those closes.
 */
export function splitFactorAfter(splits: Split[], day: string): number {
  let factor = 1;
  for (const split of splits) {
    if (split.day > day && split.ratio > 0) factor *= split.ratio;
  }
  return factor;
}

/**
 * A day either exchange trades. The portfolio is mostly TSX-listed with some
 * US holdings, so a US-only holiday (Thanksgiving) is still a session for
 * most positions, and a Canadian-only one (Canada Day) for the rest. A
 * symbol closed that day simply carries its previous close.
 */
export function isMarketDay(day: string): boolean {
  return isTradingDay(day) || isTsxTradingDay(day);
}

/** Most recent session (either exchange) on or before `day`. */
export function latestSessionOnOrBefore(day: string): string {
  let d = day;
  for (let i = 0; i < 15 && !isMarketDay(d); i++) d = addDays(d, -1);
  return d;
}

/** The session `n` sessions before `day` (which should itself be a session). */
export function sessionsBefore(day: string, n: number): string {
  let d = day;
  let left = n;
  while (left > 0) {
    d = addDays(d, -1);
    if (isMarketDay(d)) left--;
  }
  return d;
}

/** Same calendar day `months` earlier, clamped to the month's last day. */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export const PERIOD_KEYS = ["5D", "1M", "3M", "1Y"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

/**
 * The day whose close a period return is measured from, given today's
 * market date. 5D counts five sessions back from the latest session, so it
 * means five sessions on a Saturday as well as a Wednesday; the longer
 * periods step back by calendar months and take the close on or before.
 * Being a pure function of the market date, the baseline cannot drift with
 * the time of day the summary happens to be computed.
 */
export function periodBaselineDay(today: string, key: PeriodKey): string {
  switch (key) {
    case "5D":
      return sessionsBefore(latestSessionOnOrBefore(today), 5);
    case "1M":
      return addMonths(today, -1);
    case "3M":
      return addMonths(today, -3);
    case "1Y":
      return addMonths(today, -12);
  }
}

/** A cash flow from the investor's side: negative = money in, positive = money out. */
export interface CashFlow {
  day: string;
  amount: number;
}

const DAY_MS = 86_400_000;
const dayIndex = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS;

/**
 * Money-weighted annualized return (XIRR), as a percent, or null when it is
 * undefined (no money in, no money out, or under a month of history, where
 * annualizing amplifies noise into nonsense).
 */
export function xirr(flows: CashFlow[]): number | null {
  const items = flows.filter((f) => Number.isFinite(f.amount) && f.amount !== 0);
  if (!items.some((f) => f.amount < 0) || !items.some((f) => f.amount > 0)) return null;

  const t0 = Math.min(...items.map((f) => dayIndex(f.day)));
  const t1 = Math.max(...items.map((f) => dayIndex(f.day)));
  if (t1 - t0 < 30) return null;

  const years = items.map((f) => (dayIndex(f.day) - t0) / 365.25);
  const npv = (rate: number) =>
    items.reduce((sum, f, i) => sum + f.amount / Math.pow(1 + rate, years[i]), 0);

  // NPV is monotonic in the rate for an invest-then-withdraw pattern; bisect
  // on a bracket wide enough for any real portfolio.
  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (Math.sign(fLo) === Math.sign(fHi)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7 || hi - lo < 1e-10) return mid * 100;
    if (Math.sign(fMid) === Math.sign(fLo)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  return ((lo + hi) / 2) * 100;
}
