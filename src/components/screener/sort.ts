/**
 * Compare two numeric cells for a sorted results column. A missing value
 * (undefined, null or NaN) always sorts last, whichever direction, and two
 * missing values compare equal, so the comparator never returns NaN.
 */
export function compareMissingLast(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: "asc" | "desc"
): number {
  const aMissing = a == null || Number.isNaN(a);
  const bMissing = b == null || Number.isNaN(b);
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
  return dir === "asc" ? a - b : b - a;
}
