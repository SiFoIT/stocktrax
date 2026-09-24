/**
 * The monthly "import last month's CSV" reminder at the foot of the digests.
 *
 * Pure: the caller supplies today's date and each portfolio's coverage. A
 * portfolio's coverage is the latest date its CSV imports reached, recorded at
 * import time (skipped rows included), falling back to its latest stored
 * transaction for portfolios imported before coverage was recorded.
 *
 * Statements are chronological, so any activity dated in last month or later
 * means last month has been imported. From the 15th on, a portfolio whose
 * coverage stops before the first of last month is flagged.
 */

/** The day of the month the reminder starts appearing. */
export const REMINDER_START_DAY = 15;

/** Settings key holding a portfolio's recorded CSV coverage. */
export function coverageKey(portfolioId: number): string {
  return `import.coveredThrough.${portfolioId}`;
}

export type CoverageSource = "import" | "transactions" | "none";

export interface PortfolioCoverage {
  id: number;
  name: string;
  /** `YYYY-MM-DD`, or null when the portfolio has neither imports nor transactions. */
  coveredThrough: string | null;
  source: CoverageSource;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** First day of the month before `today`'s, as `YYYY-MM-DD`. */
export function lastMonthStart(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** "September" for the month before `today`'s. */
export function lastMonthName(today: string): string {
  const month = Number(lastMonthStart(today).slice(5, 7));
  return MONTH_NAMES[month - 1];
}

/**
 * Whether a portfolio takes part. An explicit choice wins; otherwise any
 * portfolio with activity on record does, so a new CSV portfolio is covered
 * without a trip to settings and an empty one never nags.
 */
export function isReminderEnabled(
  portfolio: PortfolioCoverage,
  choices: Record<string, boolean>
): boolean {
  const choice = choices[String(portfolio.id)];
  if (typeof choice === "boolean") return choice;
  return portfolio.source !== "none";
}

export interface ImportReminder {
  /** "September" — the month to import. */
  month: string;
  portfolios: { id: number; name: string; coveredThrough: string | null }[];
}

export function selectImportReminder(
  today: string,
  portfolios: PortfolioCoverage[],
  choices: Record<string, boolean>
): ImportReminder | null {
  if (Number(today.slice(8, 10)) < REMINDER_START_DAY) return null;

  const cutoff = lastMonthStart(today);
  const behind = portfolios
    .filter((p) => isReminderEnabled(p, choices))
    .filter((p) => p.coveredThrough === null || p.coveredThrough < cutoff)
    .map((p) => ({ id: p.id, name: p.name, coveredThrough: p.coveredThrough }));

  if (behind.length === 0) return null;
  return { month: lastMonthName(today), portfolios: behind };
}
