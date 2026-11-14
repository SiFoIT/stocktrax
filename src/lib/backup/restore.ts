// Pure restore rules shared by the import route and its tests. No DB access.

/** Settings key prefix whose suffix is a portfolio id (CSV import coverage). */
export const PORTFOLIO_SCOPED_SETTING_PREFIXES = ["import.coveredThrough."] as const;

/** The portfolio id a settings key belongs to, or null for a global key. */
export function portfolioIdOfSettingKey(key: string): number | null {
  for (const prefix of PORTFOLIO_SCOPED_SETTING_PREFIXES) {
    if (key.startsWith(prefix)) {
      const id = Number(key.slice(prefix.length));
      return Number.isInteger(id) ? id : null;
    }
  }
  return null;
}

/** True for a key tied to a portfolio id, which a restore must not carry over. */
export function isPortfolioScopedSettingKey(key: string): boolean {
  return PORTFOLIO_SCOPED_SETTING_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Backup settings to write. A key tied to a portfolio id is kept only when the
 * restored data has that portfolio, so a stray key can never attach to an
 * unrelated portfolio that happens to reuse the id.
 */
export function restorableSettings<T extends { key: string }>(
  settings: T[],
  portfolioIds: Set<number>
): T[] {
  return settings.filter((s) => {
    if (!isPortfolioScopedSettingKey(s.key)) return true;
    const id = portfolioIdOfSettingKey(s.key);
    return id !== null && portfolioIds.has(id);
  });
}

export interface RestorableRule {
  id: number;
  scope: string;
  symbol: string;
  holdingId: number | null;
  watchlistItemId: number | null;
}

/**
 * Alert rules whose foreign keys resolve in the restored data. A holding or
 * watchlist rule survives only when the row it points at exists and is the
 * same symbol, so a rule never silently re-attaches to a different position
 * that reused the id. Market rules have no foreign key and always survive.
 */
export function restorableAlertRules<T extends RestorableRule>(
  rules: T[],
  holdingSymbols: Map<number, string>,
  watchlistItemSymbols: Map<number, string>
): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  const same = (a: string | undefined, b: string) =>
    a !== undefined && a.trim().toUpperCase() === b.trim().toUpperCase();

  for (const rule of rules) {
    let ok = true;
    if (rule.holdingId !== null) ok &&= same(holdingSymbols.get(rule.holdingId), rule.symbol);
    if (rule.watchlistItemId !== null) {
      ok &&= same(watchlistItemSymbols.get(rule.watchlistItemId), rule.symbol);
    }
    (ok ? kept : dropped).push(rule);
  }
  return { kept, dropped };
}
