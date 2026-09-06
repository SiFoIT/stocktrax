/**
 * Formatting and styling shared by the promoted market cards and the demoted
 * market rows, so the two never drift apart.
 */

export interface AlertState {
  hasRules: boolean;
  triggered: boolean;
}

/** Currency pairs quote to more decimals than indices or commodities. */
export function isCurrencySymbol(symbol: string): boolean {
  return symbol.includes("=X");
}

export function formatMarketPrice(price: number, symbol: string): string {
  if (isCurrencySymbol(symbol)) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }
  if (price >= 10000) {
    return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatMarketChange(change: number, symbol: string): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(isCurrencySymbol(symbol) ? 3 : 2)}`;
}

/**
 * Bell colour: triggered rules read negative, armed rules positive, and an
 * unused bell stays subtle so 19 of them do not shout.
 */
export function alertBellClass(state?: AlertState): string {
  if (state?.triggered) return "text-negative hover:bg-negative/10";
  if (state?.hasRules) return "text-positive hover:bg-positive/10";
  return "text-subtle-foreground hover:bg-accent hover:text-foreground";
}
