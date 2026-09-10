import { z } from "zod";
import {
  CATALOG,
  CatalogEntry,
  HEADLINE_ENTRIES,
  SECTION_CAP,
  catalogEntry,
  isKnownPair,
  pairEntry,
  pairGroup,
} from "./catalog";

export type Category = "markets" | "commodities" | "currency" | "crypto";

export interface MarketSymbol {
  symbol: string;
  name: string;
  /** Follows the code on the table sub-line. */
  short?: string;
  /** Full sentence, used as the name's tooltip. */
  description?: string;
  /**
   * The front-month index future quoted while the cash index is not trading.
   * Only the US indices have one: the TSX contract is not reliably on Yahoo.
   */
  futures?: { symbol: string; name: string };
}

/** A currency row the user has oriented: `{base:"USD",quote:"CAD"}` is USD/CAD. */
export interface CurrencySelection {
  base: string;
  quote: string;
}

/** A currency-section row that is not a pair, such as the dollar index. */
export interface FixedSelection {
  symbol: string;
}

export type CurrencyItem = CurrencySelection | FixedSelection;

export function isPairSelection(item: CurrencyItem): item is CurrencySelection {
  return "base" in item;
}

/** What the `markets.sections` setting stores. */
export interface MarketSections {
  markets: string[];
  commodities: string[];
  currency: CurrencyItem[];
  crypto: string[];
}

export const CATEGORY_LABELS: Record<Category, string> = {
  markets: "Markets",
  commodities: "Commodities",
  currency: "Currency",
  crypto: "Crypto",
};

export const CATEGORIES: Category[] = ["markets", "commodities", "currency", "crypto"];

/** The four indices promoted to full cards at the top of the Markets panel. */
export const HEADLINE_SYMBOLS = ["^GSPC", "^GSPTSE", "^IXIC", "^DJI"] as const;

/**
 * The rows the page shipped with. Markets holds seven because the four
 * headline indices are cards and are never part of a section's eight.
 *
 * Currency lists each pair once: CAD/USD is the reciprocal of USD/CAD, so
 * showing both spends two slots on one number. The freed slot went to AUD/USD.
 */
export const DEFAULT_SECTIONS: MarketSections = {
  markets: ["^VIX", "^FTSE", "^GDAXI", "^FCHI", "^N225", "^HSI", "000001.SS"],
  commodities: ["GC=F", "SI=F", "CL=F"],
  currency: [
    { base: "USD", quote: "CAD" },
    { base: "EUR", quote: "CAD" },
    { base: "EUR", quote: "USD" },
    { base: "GBP", quote: "USD" },
    { base: "USD", quote: "JPY" },
    { base: "AUD", quote: "USD" },
  ],
  crypto: ["BTC-USD", "ETH-USD", "SOL-USD"],
};

const HEADLINE_SET = new Set<string>(HEADLINE_SYMBOLS);

/** A symbol the user may put in a section: in the catalog, not already a card. */
function isSelectableSymbol(category: Exclude<Category, "currency">, symbol: string): boolean {
  if (HEADLINE_SET.has(symbol)) return false;
  return CATALOG[category].some((entry) => entry.symbol === symbol);
}

function symbolList(category: Exclude<Category, "currency">) {
  return z
    .array(z.string().refine((s) => isSelectableSymbol(category, s), "Unknown symbol"))
    .max(SECTION_CAP)
    .refine((list) => new Set(list).size === list.length, "Duplicate symbol");
}

const currencyItem = z.union([
  z
    .object({ base: z.string().min(2).max(4), quote: z.string().min(2).max(4) })
    .strict()
    .refine((p) => isKnownPair(p.base, p.quote), "Unknown currency pair"),
  z
    .object({ symbol: z.string() })
    .strict()
    .refine((f) => CATALOG.currencyFixed.some((e) => e.symbol === f.symbol), "Unknown symbol"),
]);

export const marketSectionsSchema = z.object({
  markets: symbolList("markets"),
  commodities: symbolList("commodities"),
  currency: z
    .array(currencyItem)
    .max(SECTION_CAP)
    // A pair may appear once regardless of direction: USD/CAD and CAD/USD are
    // the same number twice, and two rows for it would just spend two slots.
    .refine((list) => {
      const keys = list.map((item) =>
        isPairSelection(item) ? [item.base, item.quote].sort().join("") : item.symbol
      );
      return new Set(keys).size === keys.length;
    }, "Duplicate currency pair"),
  crypto: symbolList("crypto"),
});

/**
 * Turn the stored selection into the entries the route fetches. The four
 * headline indices are prepended here and nowhere else, so the route and the
 * UI can never disagree about what the Markets section contains.
 */
export function resolveSections(sections: MarketSections): Record<Category, MarketSymbol[]> {
  const fromSymbols = (symbols: string[]): MarketSymbol[] =>
    symbols.map((symbol) => toMarketSymbol(catalogEntry(symbol), symbol));

  return {
    markets: [...HEADLINE_ENTRIES.map((e) => toMarketSymbol(e, e.symbol)), ...fromSymbols(sections.markets)],
    commodities: fromSymbols(sections.commodities),
    currency: sections.currency.map((item) =>
      isPairSelection(item)
        ? toMarketSymbol(pairEntry(item.base, item.quote, pairGroup(item.base, item.quote)), "")
        : toMarketSymbol(catalogEntry(item.symbol), item.symbol)
    ),
    crypto: fromSymbols(sections.crypto),
  };
}

/** A symbol dropped from the catalog still renders, under its bare code. */
function toMarketSymbol(entry: CatalogEntry | undefined, fallbackSymbol: string): MarketSymbol {
  if (!entry) return { symbol: fallbackSymbol, name: fallbackSymbol };
  return {
    symbol: entry.symbol,
    name: entry.name,
    short: entry.short,
    description: entry.description,
    futures: entry.futures,
  };
}

/** Every symbol a resolved selection will fetch. */
export function sectionSymbols(sections: MarketSections): string[] {
  const resolved = resolveSections(sections);
  return CATEGORIES.flatMap((category) => resolved[category].map((s) => s.symbol));
}
