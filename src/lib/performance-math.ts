/**
 * Pure math behind the performance chart and the benchmark comparison.
 *
 * Flows are external money from the investor's side of the account: a
 * deposit or a transfer of shares in is positive, a withdrawal negative.
 * Dividends, trades and interest are not flows; they are what the account
 * earned or did with the money.
 */
import { xirr } from "@/lib/returns";

/**
 * Cash ledger types that are money moving into or out of the account from
 * outside. Interest, referral bonuses and fee refunds are earnings, not flows.
 */
export const EXTERNAL_CASH_TYPES = new Set(["contribution", "deposit", "transfer_in", "transfer_out", "withdrawal"]);

export interface Flow {
  day: string;
  amount: number;
}

const DAY_MS = 86_400_000;
const dayNum = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS;

/**
 * Money-weighted return over (startDay, endDay] by the Modified Dietz method:
 * gain over the average capital at work, each flow weighted by how much of
 * the period it was invested. Not annualized. Null without capital at work.
 */
export function modifiedDietz(
  startValue: number,
  endValue: number,
  flows: Flow[],
  startDay: string,
  endDay: string
): number | null {
  const span = dayNum(endDay) - dayNum(startDay);
  if (span <= 0) return null;
  let net = 0;
  let weighted = 0;
  for (const f of flows) {
    if (f.day <= startDay || f.day > endDay) continue;
    net += f.amount;
    weighted += f.amount * ((dayNum(endDay) - dayNum(f.day)) / span);
  }
  const capital = startValue + weighted;
  if (capital <= 0) return null;
  return ((endValue - startValue - net) / capital) * 100;
}

/**
 * Annualized money-weighted return (XIRR) for flows ending at `endValue` on
 * `endDay`, in percent. Null when undefined (see `xirr`).
 */
export function annualized(flows: Flow[], endValue: number, endDay: string): number | null {
  return xirr([...flows.map((f) => ({ day: f.day, amount: -f.amount })), { day: endDay, amount: endValue }]);
}

/**
 * What the same flows would be worth had each one bought (or sold) a
 * benchmark at that day's close. `closeOn(day)` is the benchmark's close on
 * or before `day`, null before its history starts. Returns the value at each
 * of `days` (ascending). A flow before the benchmark's first close waits for it.
 */
export function simulateBenchmark(
  flows: Flow[],
  days: string[],
  closeOn: (day: string) => number | null
): number[] {
  const sorted = [...flows].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  let units = 0;
  let pendingCash = 0;
  let i = 0;
  return days.map((day) => {
    while (i < sorted.length && sorted[i].day <= day) {
      pendingCash += sorted[i].amount;
      i++;
    }
    const close = closeOn(day);
    if (close && close > 0 && pendingCash !== 0) {
      units += pendingCash / close;
      pendingCash = 0;
    }
    return close ? units * close + pendingCash : pendingCash;
  });
}
