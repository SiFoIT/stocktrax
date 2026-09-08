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
  const change = formatMarketChange(futures.change, futures.symbol);
  const parts = [`${futures.symbol} ${level} (${change})`];

  const traded = futures.lastTradeTime ? new Date(futures.lastTradeTime) : null;
  if (traded && !Number.isNaN(traded.getTime())) {
    parts.push(`${etTimestamp.format(traded)} ET`);
  }

  return parts.join(" · ");
}
