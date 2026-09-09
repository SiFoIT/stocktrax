/**
 * The curated set of instruments a user may put in the four Markets sections.
 *
 * Yahoo codes for indices, futures and FX are cryptic, and the symbol search
 * API only returns equities, so the catalog — not a search box — is what makes
 * readable names and plain-English descriptions possible.
 *
 * Every symbol here was verified to return a quote before being listed.
 */

export interface CatalogEntry {
  /** Yahoo code, exactly as fetched. */
  symbol: string;
  name: string;
  /** Follows the code on the table's sub-line. Keep it under 24 characters. */
  short: string;
  /** Full sentence, shown in the picker and as the name's tooltip. */
  description: string;
  group: string;
  /** The front-month contract quoted while the cash index is closed. */
  futures?: { symbol: string; label: string };
}

/** An orientable FX pair. Name, code and prose all derive from the direction. */
export interface CurrencyPair {
  base: string;
  quote: string;
  group: string;
}

export const SECTION_CAP = 8;

/**
 * Singular for "one unit of", plural for "how many you get". Yen and yuan are
 * invariant, which is why this is a table rather than an appended "s".
 */
export const CURRENCY_NAMES: Record<string, { one: string; many: string }> = {
  USD: { one: "US dollar", many: "US dollars" },
  CAD: { one: "Canadian dollar", many: "Canadian dollars" },
  EUR: { one: "euro", many: "euros" },
  GBP: { one: "British pound", many: "British pounds" },
  JPY: { one: "Japanese yen", many: "Japanese yen" },
  CHF: { one: "Swiss franc", many: "Swiss francs" },
  AUD: { one: "Australian dollar", many: "Australian dollars" },
  NZD: { one: "New Zealand dollar", many: "New Zealand dollars" },
  MXN: { one: "Mexican peso", many: "Mexican pesos" },
  CNY: { one: "Chinese yuan", many: "Chinese yuan" },
  KRW: { one: "South Korean won", many: "South Korean won" },
  INR: { one: "Indian rupee", many: "Indian rupees" },
  NOK: { one: "Norwegian krone", many: "Norwegian kroner" },
};

export function pairSymbol(base: string, quote: string): string {
  return `${base}${quote}=X`;
}

/**
 * A quote of USD/CAD at 1.38 means 1.38 Canadian dollars per US dollar, so the
 * prose reads "<quote, plural> per <base, singular>". Flipping the pair flips
 * the sentence, which is the whole point of the swap control.
 */
export function pairEntry(base: string, quote: string, group = "Other"): CatalogEntry {
  const baseName = CURRENCY_NAMES[base]?.one ?? base;
  const quoteName = CURRENCY_NAMES[quote]?.many ?? quote;
  const description = `${quoteName} per ${baseName}`;

  return {
    symbol: pairSymbol(base, quote),
    name: `${base}/${quote}`,
    short: `${quote} per ${base}`,
    description: description.charAt(0).toUpperCase() + description.slice(1),
    group,
  };
}

/**
 * The four indices promoted to cards. They are always fetched and never appear
 * in the picker, so they live apart from the catalog the picker renders.
 *
 * Listed in the order they are shown, which is also the order the chart modal
 * steps through them.
 */
export const HEADLINE_ENTRIES: CatalogEntry[] = [
  {
    symbol: "^GSPC",
    name: "S&P 500",
    short: "US large caps",
    description: "The 500 largest companies listed in the United States",
    group: "US",
    futures: { symbol: "ES=F", label: "Futures" },
  },
  {
    // The TSX contract is not reliably on Yahoo, so this card has no futures.
    symbol: "^GSPTSE",
    name: "S&P/TSX Composite",
    short: "Toronto",
    description: "The broad Canadian market, listed on the Toronto Stock Exchange",
    group: "Canada",
  },
  {
    // NQ=F tracks the Nasdaq 100, not the Composite this card shows, so it is
    // labelled for what it actually is.
    symbol: "^IXIC",
    name: "Nasdaq",
    short: "US tech-heavy",
    description: "Every company listed on the Nasdaq exchange",
    group: "US",
    futures: { symbol: "NQ=F", label: "NDX futures" },
  },
  {
    symbol: "^DJI",
    name: "Dow Jones",
    short: "US blue chips",
    description: "Thirty long-established US companies, weighted by share price",
    group: "US",
    futures: { symbol: "YM=F", label: "Futures" },
  },
];

const MARKETS: CatalogEntry[] = [
  // US
  { symbol: "^VIX", name: "VIX", short: "Volatility", description: "Expected volatility of the S&P 500 over the next 30 days", group: "US" },
  { symbol: "^RUT", name: "Russell 2000", short: "US small caps", description: "Two thousand smaller US companies", group: "US" },
  { symbol: "^TNX", name: "US 10-Year Yield", short: "Treasury yield", description: "Yield on the 10-year US Treasury note, quoted in percent", group: "US" },
  // Canada
  { symbol: "TX60.TS", name: "S&P/TSX 60", short: "Toronto large caps", description: "The 60 largest companies on the Toronto Stock Exchange", group: "Canada" },
  // Europe
  { symbol: "^FTSE", name: "FTSE 100", short: "London", description: "The 100 largest companies on the London Stock Exchange", group: "Europe" },
  { symbol: "^GDAXI", name: "DAX", short: "Frankfurt", description: "The 40 largest companies on the Frankfurt exchange", group: "Europe" },
  { symbol: "^FCHI", name: "CAC 40", short: "Paris", description: "The 40 largest companies on the Paris exchange", group: "Europe" },
  { symbol: "^STOXX50E", name: "Euro Stoxx 50", short: "Eurozone", description: "Fifty leading companies from across the eurozone", group: "Europe" },
  { symbol: "^SSMI", name: "SMI", short: "Zurich", description: "The 20 largest companies on the Swiss exchange", group: "Europe" },
  { symbol: "^IBEX", name: "IBEX 35", short: "Madrid", description: "The 35 largest companies on the Madrid exchange", group: "Europe" },
  { symbol: "FTSEMIB.MI", name: "FTSE MIB", short: "Milan", description: "The 40 largest companies on the Milan exchange", group: "Europe" },
  // Asia-Pacific
  { symbol: "^N225", name: "Nikkei 225", short: "Tokyo", description: "Two hundred and twenty-five large Japanese companies", group: "Asia-Pacific" },
  { symbol: "^HSI", name: "Hang Seng", short: "Hong Kong", description: "The largest companies listed in Hong Kong", group: "Asia-Pacific" },
  { symbol: "000001.SS", name: "Shanghai Composite", short: "Shanghai", description: "Every stock listed on the Shanghai exchange", group: "Asia-Pacific" },
  { symbol: "^AXJO", name: "ASX 200", short: "Sydney", description: "The 200 largest companies on the Australian exchange", group: "Asia-Pacific" },
  { symbol: "^KS11", name: "KOSPI", short: "Seoul", description: "Every common stock on the Korea Exchange", group: "Asia-Pacific" },
  { symbol: "^NSEI", name: "Nifty 50", short: "Mumbai", description: "The 50 largest companies on India's National Stock Exchange", group: "Asia-Pacific" },
  { symbol: "^TWII", name: "Taiwan Weighted", short: "Taipei", description: "Every listed company on the Taiwan Stock Exchange", group: "Asia-Pacific" },
  // Other
  { symbol: "^BVSP", name: "Bovespa", short: "São Paulo", description: "The most traded stocks on Brazil's B3 exchange", group: "Other" },
];

const COMMODITIES: CatalogEntry[] = [
  // Metals
  { symbol: "GC=F", name: "Gold", short: "COMEX front month", description: "Gold futures, US dollars per troy ounce", group: "Metals" },
  { symbol: "SI=F", name: "Silver", short: "COMEX front month", description: "Silver futures, US dollars per troy ounce", group: "Metals" },
  { symbol: "PL=F", name: "Platinum", short: "NYMEX front month", description: "Platinum futures, US dollars per troy ounce", group: "Metals" },
  { symbol: "PA=F", name: "Palladium", short: "NYMEX front month", description: "Palladium futures, US dollars per troy ounce", group: "Metals" },
  { symbol: "HG=F", name: "Copper", short: "COMEX front month", description: "Copper futures, US dollars per pound", group: "Metals" },
  // Energy
  { symbol: "CL=F", name: "Crude Oil", short: "WTI front month", description: "West Texas Intermediate crude futures, US dollars per barrel", group: "Energy" },
  { symbol: "BZ=F", name: "Brent Crude", short: "ICE front month", description: "Brent crude futures, the international oil benchmark, per barrel", group: "Energy" },
  { symbol: "NG=F", name: "Natural Gas", short: "Henry Hub", description: "Natural gas futures, US dollars per million British thermal units", group: "Energy" },
  { symbol: "RB=F", name: "Gasoline", short: "RBOB front month", description: "Reformulated gasoline futures, US dollars per gallon", group: "Energy" },
  // Agriculture
  { symbol: "ZC=F", name: "Corn", short: "CBOT front month", description: "Corn futures, US cents per bushel", group: "Agriculture" },
  { symbol: "ZW=F", name: "Wheat", short: "CBOT front month", description: "Chicago wheat futures, US cents per bushel", group: "Agriculture" },
  { symbol: "ZS=F", name: "Soybeans", short: "CBOT front month", description: "Soybean futures, US cents per bushel", group: "Agriculture" },
  { symbol: "KC=F", name: "Coffee", short: "ICE front month", description: "Arabica coffee futures, US cents per pound", group: "Agriculture" },
  { symbol: "SB=F", name: "Sugar", short: "ICE front month", description: "Raw sugar futures, US cents per pound", group: "Agriculture" },
  { symbol: "LE=F", name: "Live Cattle", short: "CME front month", description: "Live cattle futures, US cents per pound", group: "Agriculture" },
];

const CRYPTO: CatalogEntry[] = [
  { symbol: "BTC-USD", name: "Bitcoin", short: "in US dollars", description: "Bitcoin priced in US dollars", group: "Major" },
  { symbol: "ETH-USD", name: "Ethereum", short: "in US dollars", description: "Ether priced in US dollars", group: "Major" },
  { symbol: "SOL-USD", name: "Solana", short: "in US dollars", description: "Solana priced in US dollars", group: "Major" },
  { symbol: "XRP-USD", name: "XRP", short: "in US dollars", description: "XRP priced in US dollars", group: "Major" },
  { symbol: "BNB-USD", name: "BNB", short: "in US dollars", description: "BNB priced in US dollars", group: "Major" },
  { symbol: "ADA-USD", name: "Cardano", short: "in US dollars", description: "Cardano priced in US dollars", group: "Other" },
  { symbol: "DOGE-USD", name: "Dogecoin", short: "in US dollars", description: "Dogecoin priced in US dollars", group: "Other" },
  { symbol: "AVAX-USD", name: "Avalanche", short: "in US dollars", description: "Avalanche priced in US dollars", group: "Other" },
  { symbol: "LINK-USD", name: "Chainlink", short: "in US dollars", description: "Chainlink priced in US dollars", group: "Other" },
  { symbol: "LTC-USD", name: "Litecoin", short: "in US dollars", description: "Litecoin priced in US dollars", group: "Other" },
  { symbol: "BTC-CAD", name: "Bitcoin (CAD)", short: "in Canadian dollars", description: "Bitcoin priced in Canadian dollars", group: "Canadian" },
];

/**
 * Listed once, in a canonical direction. The user picks the orientation, so a
 * pair only belongs here when Yahoo quotes it BOTH ways — the Brazilian real,
 * Singapore dollar and Polish zloty have no X/CAD contract and would leave a
 * dead row behind the first flip.
 *
 * The Canadian group is deliberately the long one: it is the reason most of
 * these are here.
 */
const CURRENCY_PAIRS: CurrencyPair[] = [
  { base: "USD", quote: "CAD", group: "Canadian dollar" },
  { base: "EUR", quote: "CAD", group: "Canadian dollar" },
  { base: "GBP", quote: "CAD", group: "Canadian dollar" },
  { base: "AUD", quote: "CAD", group: "Canadian dollar" },
  { base: "JPY", quote: "CAD", group: "Canadian dollar" },
  { base: "CHF", quote: "CAD", group: "Canadian dollar" },
  { base: "NZD", quote: "CAD", group: "Canadian dollar" },
  { base: "CNY", quote: "CAD", group: "Canadian dollar" },
  { base: "MXN", quote: "CAD", group: "Canadian dollar" },
  { base: "KRW", quote: "CAD", group: "Canadian dollar" },
  { base: "INR", quote: "CAD", group: "Canadian dollar" },
  { base: "NOK", quote: "CAD", group: "Canadian dollar" },
  { base: "EUR", quote: "USD", group: "Majors" },
  { base: "GBP", quote: "USD", group: "Majors" },
  { base: "USD", quote: "JPY", group: "Majors" },
  { base: "USD", quote: "CHF", group: "Majors" },
  { base: "AUD", quote: "USD", group: "Majors" },
  { base: "NZD", quote: "USD", group: "Majors" },
  { base: "USD", quote: "MXN", group: "Other" },
  { base: "USD", quote: "CNY", group: "Other" },
  { base: "EUR", quote: "GBP", group: "Other" },
];

/** Currency-section entries that are not pairs, so they cannot be flipped. */
const CURRENCY_FIXED: CatalogEntry[] = [
  {
    symbol: "DX-Y.NYB",
    name: "US Dollar Index",
    short: "USD vs six majors",
    description: "The US dollar measured against a basket of six major currencies",
    group: "Index",
  },
];

export const CATALOG = {
  markets: MARKETS,
  commodities: COMMODITIES,
  currency: CURRENCY_PAIRS,
  currencyFixed: CURRENCY_FIXED,
  crypto: CRYPTO,
} as const;

/** Group headings in the order the picker should render them. */
export const GROUP_ORDER: Record<string, string[]> = {
  markets: ["US", "Canada", "Europe", "Asia-Pacific", "Other"],
  commodities: ["Metals", "Energy", "Agriculture"],
  currency: ["Canadian dollar", "Majors", "Other", "Index"],
  crypto: ["Major", "Other", "Canadian"],
};

const BY_SYMBOL = new Map<string, CatalogEntry>(
  [...MARKETS, ...COMMODITIES, ...CRYPTO, ...CURRENCY_FIXED, ...HEADLINE_ENTRIES].map((e) => [
    e.symbol,
    e,
  ])
);

export function catalogEntry(symbol: string): CatalogEntry | undefined {
  return BY_SYMBOL.get(symbol);
}

/** Pairs are keyed without direction, so USD/CAD and CAD/USD are one entry. */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join("");
}

const PAIR_KEYS = new Set(CURRENCY_PAIRS.map((p) => pairKey(p.base, p.quote)));

export function isKnownPair(base: string, quote: string): boolean {
  return PAIR_KEYS.has(pairKey(base, quote));
}

export function pairGroup(base: string, quote: string): string {
  const match = CURRENCY_PAIRS.find((p) => pairKey(p.base, p.quote) === pairKey(base, quote));
  return match?.group ?? "Other";
}

/**
 * Split a Yahoo FX code back into its two currencies, but only for a pair the
 * catalog actually lists. This is what decides whether a row can be flipped;
 * the dollar index and anything unrecognised return null.
 */
export function parsePairSymbol(symbol: string): { base: string; quote: string } | null {
  const match = /^([A-Z]{3})([A-Z]{3})=X$/.exec(symbol);
  if (!match) return null;
  const [, base, quote] = match;
  return isKnownPair(base, quote) ? { base, quote } : null;
}
