/**
 * Formatting and styling shared by the promoted market cards and the demoted
 * market rows, so the two never drift apart.
 */

import { MarketData, ProxyQuote } from "@/types";
import { selectExtendedHours, type ExtendedHoursMove } from "@/lib/extended-hours";

export interface AlertState {
  hasRules: boolean;
  triggered: boolean;
}

/** Currency pairs quote to more decimals than indices or commodities. */
export function isCurrencySymbol(symbol: string): boolean {
  return symbol.includes("=X");
}

/**
 * Decimals scale with magnitude, because one fixed width cannot serve a row
 * set the user chooses. A pair flipped into JPY/CAD quotes near 0.009 and a
 * sub-dollar token near 0.087; at the widths that suit USD/CAD and Gold both
 * would round away to nothing. Every instrument on the shipped page keeps the
 * width it had.
 */
export function priceDecimals(value: number, symbol: string): number {
  const abs = Math.abs(value);
  const currency = isCurrencySymbol(symbol);
  // A failed quote reads 0; it should print as a price, not as 0.000000.
  if (abs === 0) return currency ? 3 : 2;
  if (currency) {
    if (abs >= 0.1) return 3;
    // Below that, hold four significant figures rather than a fixed width: the
    // won quotes near 0.001 and the yen near 0.0065, and one width cannot show
    // both without either dropping a digit or padding zeros onto the other.
    return Math.min(8, 3 - Math.floor(Math.log10(abs)));
  }
  if (abs >= 10000) return 0;
  if (abs >= 1) return 2;
  return abs >= 0.01 ? 4 : 6;
}

export function formatMarketPrice(price: number, symbol: string): string {
  const decimals = priceDecimals(price, symbol);
  return price.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Width comes from the row's price, not from the change, so the two columns
 * of a row never disagree about how precise the instrument is.
 */
export function formatMarketChange(change: number, symbol: string, price = change): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(priceDecimals(price, symbol))}`;
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

/**
 * The proxy ETF only adds information while the cash index is not trading;
 * during the session the card's own price is live. Which print to show (pre
 * or after market) follows the same rule as the stock rows.
 *
 * A card with no `extendedHours` at all failed its quote, which is not a
 * session, so the line still shows when the fund has a print.
 */
export function proxyMove(data: MarketData): ExtendedHoursMove | null {
  if (!data.proxy || data.extendedHours?.marketState === "REGULAR") return null;
  return selectExtendedHours(data.proxy.extendedHours);
}

const etWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });
const etTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * What the row's "After:" leaves out: which fund stands in for the index, its
 * print, and as of when. The name earns its place on the Nasdaq card, whose
 * fund tracks the 100 rather than the Composite the card itself shows. Over a
 * weekend the weekday is what reveals how old the print is.
 */
export function proxyTooltip(proxy: ProxyQuote, move: ExtendedHoursMove): string {
  const level = formatMarketPrice(move.price, proxy.symbol);
  const change =
    move.change !== undefined ? ` (${formatMarketChange(move.change, proxy.symbol, move.price)})` : "";
  const parts = [proxy.name, `${proxy.symbol} ${level}${change}`];

  const at = move.time ? new Date(move.time) : null;
  if (at && !Number.isNaN(at.getTime())) {
    parts.push(`${etWeekday.format(at)} ${etTime.format(at)} ET`);
  }

  return parts.join(" · ");
}
