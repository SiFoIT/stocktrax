// Trade-date helpers shared by the transaction routes and the CSV import.
// Pure module — no DB dependencies.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize a trade date to 12:00 UTC on its calendar day.
 *
 * Transactions carry a calendar day, not a time. Imports have always stored
 * noon UTC, so every write path does the same: a date-only manual add would
 * otherwise land at 00:00 UTC and sort ahead of an imported trade from the same
 * day, which reorders a same-day buy and sell when the holding is recomputed.
 *
 * Accepts `YYYY-MM-DD` or a full ISO timestamp (its UTC calendar day is kept).
 * Returns null when the input does not parse.
 */
export function normalizeTradeDate(input: string): Date | null {
  const trimmed = input.trim();
  const day = DATE_ONLY.test(trimmed) ? trimmed : null;
  const parsed = new Date(day ? `${day}T12:00:00Z` : trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  if (day) {
    // Reject impossible days such as 2026-02-31, which Date would roll over.
    return parsed.toISOString().slice(0, 10) === day ? parsed : null;
  }
  return new Date(`${parsed.toISOString().slice(0, 10)}T12:00:00Z`);
}

/** The UTC calendar day of a stored timestamp, as `YYYY-MM-DD`. */
export function utcDay(date: Date | string | number): string {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * The timestamp a PATCH should store. When the edit keeps the calendar day the
 * stored timestamp is left alone, so editing a price never moves a trade
 * relative to the others recorded that day.
 */
export function resolveEditedTradeDate(existing: Date, incoming: Date): Date {
  return utcDay(existing) === utcDay(incoming) ? existing : incoming;
}

/** Trim and upper-case a ticker so "td.to " and "TD.TO" are the same holding. */
export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}
