/**
 * Number formatting for the stock details modal. Price-like figures take their
 * width from the instrument's own price (as the Markets panel does), so a
 * sub-cent token or an FX pair does not round away; index levels and FX rates
 * carry no currency symbol, because they are not amounts of money.
 */

import { isCurrencySymbol, priceDecimals } from "@/components/markets/market-format";

/** Pence-quoted lines (LSE) arrive as "GBp"; Intl would read that as pounds. */
function isPence(currency: string | undefined): boolean {
  return currency === "GBp" || currency === "GBX";
}

/** Index levels and FX rates are plain numbers, not money. */
export function isPlainQuote(symbol: string, quoteType?: string): boolean {
  return quoteType === "INDEX" || symbol.startsWith("^") || isCurrencySymbol(symbol);
}

function withCurrency(value: number, decimals: number, currency: string | undefined): string {
  const opts = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  if (!currency) return value.toLocaleString(undefined, opts);
  if (isPence(currency)) return `${value.toLocaleString(undefined, opts)}p`;
  try {
    return value.toLocaleString(undefined, { ...opts, style: "currency", currency });
  } catch {
    return `${value.toLocaleString(undefined, opts)} ${currency}`;
  }
}

interface PriceContext {
  symbol: string;
  currency?: string;
  quoteType?: string;
  /** The instrument's current price; sets the width so every row of a quote agrees. */
  price?: number;
}

/** A price-like figure (last, open, highs and lows, averages, targets). */
export function formatQuotePrice(value: number | undefined | null, ctx: PriceContext): string {
  if (value === undefined || value === null) return "-";
  const decimals = priceDecimals(ctx.price ?? value, ctx.symbol);
  if (isPlainQuote(ctx.symbol, ctx.quoteType)) {
    return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return withCurrency(value, decimals, ctx.currency);
}

/** A per-share amount (EPS, dividend rate, book value): always two decimals, in the quote's currency. */
export function formatPerShare(value: number | undefined | null, currency: string | undefined): string {
  if (value === undefined || value === null) return "-";
  return withCurrency(value, 2, currency);
}

/** A signed price change at the width of the instrument's price. */
export function formatQuoteChange(change: number | undefined | null, ctx: PriceContext): string {
  if (change === undefined || change === null) return "-";
  const decimals = priceDecimals(ctx.price ?? change, ctx.symbol);
  const rounded = Number(change.toFixed(decimals)) || 0;
  const sign = rounded >= 0 ? "+" : "-";
  return `${sign}${Math.abs(rounded).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Market cap, revenue and the like: "-$5.00B", in the quote's currency. */
export function formatLargeAmount(value: number | undefined | null, currency: string | undefined): string {
  if (value === undefined || value === null) return "-";
  const opts: Intl.NumberFormatOptions = {
    notation: "compact",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };
  if (!currency || isPence(currency)) return value.toLocaleString(undefined, opts);
  try {
    return value.toLocaleString(undefined, { ...opts, style: "currency", currency });
  } catch {
    return `${value.toLocaleString(undefined, opts)} ${currency}`;
  }
}
