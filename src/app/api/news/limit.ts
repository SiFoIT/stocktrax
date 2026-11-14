export const DEFAULT_NEWS_LIMIT = 5;
export const MAX_NEWS_LIMIT = 50;

/**
 * The `limit` query param as a whole number of articles. Missing or junk
 * ("abc", "-3", "2.5") falls back to the default rather than reaching Yahoo
 * as NaN; anything above the cap is clamped.
 */
export function parseNewsLimit(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw.trim())) return DEFAULT_NEWS_LIMIT;
  const n = Number(raw.trim());
  if (n < 1) return DEFAULT_NEWS_LIMIT;
  return Math.min(n, MAX_NEWS_LIMIT);
}
