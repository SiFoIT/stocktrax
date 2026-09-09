/**
 * Formatting and styling shared by the promoted market cards and the demoted
 * market rows, so the two never drift apart.
 */

import { FuturesQuote, MarketData } from "@/types";

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
function priceDecimals(value: number, symbol: string): number {
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
 * Futures only add information while the cash index is not trading; during the
 * session the card's own price is live and the two would disagree by the basis.
 *
 * A card with no `extendedHours` at all failed its quote, which is not a
 * session, so the line still shows.
 */
export function showFutures(data: MarketData): boolean {
  return !!data.futures && data.extendedHours?.marketState !== "REGULAR";
}

const etTimestamp = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * The detail the card deliberately leaves out: which contract, at what level,
 * as of when. Over a weekend the timestamp is what reveals a stale quote.
 */
export function futuresTooltip(futures: FuturesQuote): string {
  const level = formatMarketPrice(futures.price, futures.symbol);
  const change = formatMarketChange(futures.change, futures.symbol, futures.price);
  const parts = [`${futures.symbol} ${level} (${change})`];

  const traded = futures.lastTradeTime ? new Date(futures.lastTradeTime) : null;
  if (traded && !Number.isNaN(traded.getTime())) {
    parts.push(`${etTimestamp.format(traded)} ET`);
  }

  return parts.join(" · ");
}
