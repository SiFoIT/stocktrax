/**
 * Pure time helpers for the price chart. Intraday bar times have already been
 * shifted by toEasternTime, so they are New York wall-clock times dressed up as
 * UTC seconds: read them back in UTC, never in the browser's own zone.
 */

const DAY_SECONDS = 24 * 60 * 60;

/** "Nov 13, 3:55 PM" for an ET-shifted intraday bar, whatever the browser's zone. */
export function formatEtShiftedTime(time: number): string {
  return new Date(time * 1000).toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The first bar time of the last `sessions` trading days present in `times`
 * (ET-shifted seconds, ascending). Counting the days in the data rather than
 * stepping back N×24h keeps "5D" at five sessions across weekends and holidays.
 */
export function sessionWindowStart(times: number[], sessions: number): number | undefined {
  if (times.length === 0 || sessions < 1) return undefined;
  let seen = 0;
  let currentDay: number | undefined;
  let start = times[times.length - 1];
  for (let i = times.length - 1; i >= 0; i--) {
    const day = Math.floor(times[i] / DAY_SECONDS);
    if (day !== currentDay) {
      if (seen === sessions) break;
      seen++;
      currentDay = day;
    }
    start = times[i];
  }
  return start;
}
