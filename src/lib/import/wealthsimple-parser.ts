// WealthSimple CSV Parser
// Pure parsing module — no DB dependencies, works in browser + server

export interface ParsedStockTransaction {
  type: "buy" | "sell" | "dividend" | "transfer_in";
  symbol: string;
  shares: number;
  price: number;
  date: string; // ISO date string
  currency: string;
  rawDescription: string;
  /**
   * Shares received from a stock split or distribution (WS `STKDIS`). They
   * arrive as `transfer_in` at $0 and must stay at $0: a split adds shares,
   * not book value, so no ACB is ever applied to them.
   */
  isDistribution?: boolean;
}

export interface ParsedCashTransaction {
  type: "contribution" | "deposit" | "refund" | "referral" | "transfer_in" | "transfer_out" | "fx_conversion";
  description: string;
  amount: number;
  date: string; // ISO date string
  currency: string;
}

export interface SkippedRow {
  wsType: string;
  description: string;
  date: string;
}

export interface UnrecognizedRow {
  wsType: string;
  description: string;
  date: string;
  amount: string;
}

export interface WealthSimpleParseResult {
  stockTransactions: ParsedStockTransaction[];
  cashTransactions: ParsedCashTransaction[];
  skipped: SkippedRow[];
  unrecognized: UnrecognizedRow[];
  errors: string[];
  /**
   * The latest date on any row of the file, skipped and unrecognized rows
   * included, as `YYYY-MM-DD`. Null when no row carried a readable date. This
   * is what the import reminder measures, so a month whose only activity was
   * skipped rows still counts as imported.
   */
  coveredThrough: string | null;
  /**
   * Rows dropped by parseMultipleFiles because another file of the same
   * upload already carried them (overlapping monthly and YTD exports, or the
   * same file picked twice). Absent for a single-file parse.
   */
  crossFileDuplicates?: number;
}

// WS types we intentionally skip
const SKIP_TYPES = new Set(["LOAN", "RECALL", "FPLINT"]);

// WS types that map to cash transactions
const CASH_TYPE_MAP: Record<string, ParsedCashTransaction["type"]> = {
  CONT: "contribution",
  DEP: "deposit",
  REFUND: "refund",
  REFER: "referral",
  TRFINTF: "transfer_in",
  TRFOUTTF: "transfer_out",
  TRFOUT: "transfer_out",
  FXCONVERSION: "fx_conversion",
};

interface CsvRow {
  Date: string;
  Type: string;
  Description: string;
  Amount?: string;
  Currency?: string;
  /** Listing exchange, when the export carries one (e.g. TSX, TSXV, NEO, CSE). */
  Exchange?: string;
  [key: string]: string | undefined;
}

// Map WS CSV headers (lowercase) to our expected keys
const HEADER_MAP: Record<string, string> = {
  date: "Date",
  transaction: "Type",
  description: "Description",
  amount: "Amount",
  balance: "Balance",
  currency: "Currency",
  exchange: "Exchange",
  // Also accept already-capitalized headers
  Date: "Date",
  Type: "Type",
  Description: "Description",
  Amount: "Amount",
  Balance: "Balance",
  Currency: "Currency",
  Exchange: "Exchange",
};

function parseCsvText(text: string): CsvRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  // Parse header row, handle BOM
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const rawHeaders = parseCSVLine(headerLine);
  // Normalize headers to expected keys
  const headers = rawHeaders.map((h) => HEADER_MAP[h] || h);

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || "";
    }
    rows.push(row as CsvRow);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function parseWsDate(dateStr: string): string {
  // WS dates are typically "YYYY-MM-DD" format
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toISOString();
}

/** A row's date as `YYYY-MM-DD`, or null when it does not parse. */
function rowDateStr(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr.trim() + "T12:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function laterDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Parse a statement amount. Accepts currency symbols and codes, thousands
 * separators, a leading minus (ASCII or Unicode) and accounting-style
 * parentheses: "(12.50)" and "-$12.50" are both -12.5. An empty cell is 0.
 * Returns NaN when the text is not a number, so the caller can reject the row.
 */
export function parseAmount(amountStr: string | undefined): number {
  let text = (amountStr ?? "").trim();
  if (!text) return 0;
  let negative = false;
  const paren = text.match(/^\((.*)\)$/);
  if (paren) {
    negative = true;
    text = paren[1];
  }
  text = text
    .replace(/[\u2212\u2012\u2013]/g, "-")
    .replace(/[A-Za-z]{3}(?=[\s$\d-]|$)/g, "") // currency codes: CAD, USD
    .replace(/[A-Za-z]*\$|[€£¥]/g, "") // $, CA$, US$, C$
    .replace(/[,\s]/g, "");
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return NaN;
  const value = parseFloat(text);
  return negative ? -value : value;
}

/** Yahoo's suffix for each Canadian listing venue. */
const CANADIAN_EXCHANGE_SUFFIX: Record<string, string> = {
  TSX: ".TO",
  TOR: ".TO",
  "TORONTO STOCK EXCHANGE": ".TO",
  TSXV: ".V",
  "TSX-V": ".V",
  "TSX VENTURE": ".V",
  "TSX VENTURE EXCHANGE": ".V",
  CVE: ".V",
  NEO: ".NE",
  "NEO EXCHANGE": ".NE",
  "CBOE CANADA": ".NE",
  CSE: ".CN",
  CNSX: ".CN",
  "CANADIAN SECURITIES EXCHANGE": ".CN",
};

/** US venues: a symbol listed here takes no suffix whatever the trade currency. */
const US_EXCHANGES = new Set([
  "NYSE", "NASDAQ", "NYSEARCA", "NYSE ARCA", "ARCA", "AMEX", "NYSE AMERICAN",
  "NYSEAMERICAN", "BATS", "CBOE", "CBOE BZX", "OTC", "NMS", "NYQ", "NGM", "NCM", "PCX", "ASE",
]);

/** Suffixes that already name a Canadian venue in Yahoo's format. */
const YAHOO_CANADIAN_SUFFIX = /\.(TO|V|NE|CN)$/i;

/**
 * Convert a raw broker symbol to Yahoo Finance format.
 *
 * Yahoo writes share classes and units with a hyphen (BRK.B → BRK-B,
 * RCI.B → RCI-B.TO, SRU.UN → SRU-UN.TO), on both sides of the border.
 * Canadian listings carry a venue suffix: the exchange column picks it when
 * the export has one (TSXV → .V, NEO/Cboe Canada → .NE, CSE → .CN); a symbol
 * that already ends in one keeps it; otherwise a CAD trade defaults to .TO.
 * .U is a TSX convention for USD-denominated units (HISU.U → HISU-U.TO).
 */
export function toYahooSymbol(symbol: string, currency: string, exchange?: string): string {
  const raw = symbol.trim().toUpperCase();
  const venue = (exchange ?? "").trim().toUpperCase();
  const venueSuffix = CANADIAN_EXCHANGE_SUFFIX[venue];

  const existing = raw.match(YAHOO_CANADIAN_SUFFIX);
  const base = existing ? raw.slice(0, -existing[0].length) : raw;
  const yahooBase = base.replace(/[./]/g, "-");

  if (existing) return yahooBase + (venueSuffix ?? existing[0]);
  if (venueSuffix) return yahooBase + venueSuffix;

  // A US venue means no suffix whatever the trade currency; otherwise CAD
  // trades and .U units are taken as TSX.
  const isCanadian = !US_EXCHANGES.has(venue) && (currency === "CAD" || /\.U$/.test(raw));
  return isCanadian ? yahooBase + ".TO" : yahooBase;
}

/** WS types parsed as stock transactions (TRFIN is handled on its own). */
const STOCK_TYPES = new Set(["BUY", "SELL", "DIV", "STKDIS"]);

// Description regex patterns
const BUY_PATTERN = /^(\S+)\s*-\s*.+?:\s*Bought\s+([\d,.]+)\s+shares/;
const SELL_PATTERN = /^(\S+)\s*-\s*.+?:\s*Sold\s+([\d,.]+)\s+shares/;
const DIV_PATTERN = /^(\S+)\s*-\s*.+?:\s*Cash dividend distribution/;
const TRFIN_PATTERN = /^(\S+)\s*-\s*.+?:\s*Transfer of\s+([\d,.]+)\s+shares/;
const STKDIS_PATTERN = /^(\S+)\s*-\s*.+?:\s*Distribution of\s+([\d,.]+)\s+shares/;

/** Parse a share count that may contain thousands separators (e.g. "1,000"). */
function parseShares(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""));
}

function parseStockRow(row: CsvRow): ParsedStockTransaction | null {
  const wsType = row.Type;
  const desc = row.Description;
  const amount = parseAmount(row.Amount);
  const currency = row.Currency || "CAD";
  const date = parseWsDate(row.Date);

  if (wsType === "BUY") {
    const match = desc.match(BUY_PATTERN);
    if (!match) return null;
    const effectiveCurrency = /\.U$/i.test(match[1]) ? "USD" : currency;
    const symbol = toYahooSymbol(match[1], currency, row.Exchange);
    const shares = parseShares(match[2]);
    const price = shares > 0 ? Math.abs(amount) / shares : 0;
    return { type: "buy", symbol, shares, price, date, currency: effectiveCurrency, rawDescription: desc };
  }

  if (wsType === "SELL") {
    const match = desc.match(SELL_PATTERN);
    if (!match) return null;
    const effectiveCurrency = /\.U$/i.test(match[1]) ? "USD" : currency;
    const symbol = toYahooSymbol(match[1], currency, row.Exchange);
    const shares = parseShares(match[2]);
    const price = shares > 0 ? Math.abs(amount) / shares : 0;
    return { type: "sell", symbol, shares, price, date, currency: effectiveCurrency, rawDescription: desc };
  }

  if (wsType === "DIV") {
    const match = desc.match(DIV_PATTERN);
    if (!match) return null;
    const effectiveCurrency = /\.U$/i.test(match[1]) ? "USD" : currency;
    const symbol = toYahooSymbol(match[1], currency, row.Exchange);
    // Preserve sign: negative amounts are dividend reversals/corrections and
    // must reduce recorded income, not add to it.
    return { type: "dividend", symbol, shares: 1, price: amount, date, currency: effectiveCurrency, rawDescription: desc };
  }

  if (wsType === "TRFIN") {
    const match = desc.match(TRFIN_PATTERN);
    if (!match) return null;
    const effectiveCurrency = /\.U$/i.test(match[1]) ? "USD" : currency;
    const symbol = toYahooSymbol(match[1], currency, row.Exchange);
    const shares = parseShares(match[2]);
    return { type: "transfer_in", symbol, shares, price: 0, date, currency: effectiveCurrency, rawDescription: desc };
  }

  if (wsType === "STKDIS") {
    const match = desc.match(STKDIS_PATTERN);
    if (!match) return null;
    const effectiveCurrency = /\.U$/i.test(match[1]) ? "USD" : currency;
    const symbol = toYahooSymbol(match[1], currency, row.Exchange);
    const shares = parseShares(match[2]);
    return {
      type: "transfer_in",
      symbol,
      shares,
      price: 0,
      date,
      currency: effectiveCurrency,
      rawDescription: desc,
      isDistribution: true,
    };
  }

  return null;
}

function parseCashRow(row: CsvRow): ParsedCashTransaction | null {
  const wsType = row.Type;
  const cashType = CASH_TYPE_MAP[wsType];
  if (!cashType) return null;

  const amount = parseAmount(row.Amount);
  const currency = row.Currency || "CAD";
  const date = parseWsDate(row.Date);

  return {
    type: cashType,
    description: row.Description,
    amount,
    date,
    currency,
  };
}

export function parseWealthSimpleCsv(csvText: string, fileName?: string): WealthSimpleParseResult {
  const result: WealthSimpleParseResult = {
    stockTransactions: [],
    cashTransactions: [],
    skipped: [],
    unrecognized: [],
    errors: [],
    coveredThrough: null,
  };

  let rows: CsvRow[];
  try {
    rows = parseCsvText(csvText);
  } catch (e) {
    result.errors.push(`Failed to parse CSV${fileName ? ` (${fileName})` : ""}: ${e}`);
    return result;
  }

  if (rows.length === 0) {
    result.errors.push(`No data rows found${fileName ? ` in ${fileName}` : ""}`);
    return result;
  }

  for (const row of rows) {
    const wsType = (row.Type || "").trim();

    // Skip blank/empty type rows
    if (!wsType) continue;

    result.coveredThrough = laterDate(result.coveredThrough, rowDateStr(row.Date));

    // Skip intentionally ignored types
    if (SKIP_TYPES.has(wsType)) {
      result.skipped.push({
        wsType,
        description: row.Description,
        date: row.Date,
      });
      continue;
    }

    // A row whose amount carries the value must have a readable one. Reject
    // just that row, with the text that failed, rather than letting NaN reach
    // the import and fail the whole request.
    const isStockTransfer =
      wsType === "STKDIS" ||
      (wsType === "TRFIN" && TRFIN_PATTERN.test(row.Description || ""));
    const needsAmount = !isStockTransfer && (STOCK_TYPES.has(wsType) || wsType === "TRFIN" || wsType in CASH_TYPE_MAP);
    if (needsAmount && !Number.isFinite(parseAmount(row.Amount))) {
      result.errors.push(
        `Unreadable amount "${row.Amount}" on ${wsType} row dated ${row.Date}: ${row.Description}`
      );
      continue;
    }

    // TRFIN can be stock transfer OR cash transfer
    if (wsType === "TRFIN") {
      const stockTxn = parseStockRow(row);
      if (stockTxn) {
        result.stockTransactions.push(stockTxn);
      } else {
        // Cash money transfer (e.g. "Money transfer into the account")
        const amount = parseAmount(row.Amount);
        const currency = row.Currency || "CAD";
        const date = parseWsDate(row.Date);
        result.cashTransactions.push({
          type: "transfer_in",
          description: row.Description,
          amount,
          date,
          currency,
        });
      }
      continue;
    }

    // Try stock transaction types
    if (STOCK_TYPES.has(wsType)) {
      const stockTxn = parseStockRow(row);
      if (stockTxn) {
        result.stockTransactions.push(stockTxn);
      } else {
        result.errors.push(`Failed to parse ${wsType} row: ${row.Description}`);
      }
      continue;
    }

    // Try cash transaction types
    if (wsType in CASH_TYPE_MAP) {
      const cashTxn = parseCashRow(row);
      if (cashTxn) {
        result.cashTransactions.push(cashTxn);
      } else {
        result.errors.push(`Failed to parse cash row: ${row.Description}`);
      }
      continue;
    }

    // Unrecognized type
    result.unrecognized.push({
      wsType,
      description: row.Description,
      date: row.Date,
      amount: row.Amount || "",
    });
  }

  return result;
}

export function parseMultipleFiles(
  files: { name: string; content: string }[]
): WealthSimpleParseResult {
  const merged: WealthSimpleParseResult = {
    stockTransactions: [],
    cashTransactions: [],
    skipped: [],
    unrecognized: [],
    errors: [],
    coveredThrough: null,
  };

  const stockMerge = createCrossFileMerge<ParsedStockTransaction>((t) =>
    `${stockTxnDedupKey(t.date, t.symbol, t.type, t.shares, t.price)}|${t.currency}`
  );
  const cashMerge = createCrossFileMerge<ParsedCashTransaction>((t) =>
    cashTxnDedupKey(t.date, t.type, t.amount, t.currency)
  );

  for (const file of files) {
    const result = parseWealthSimpleCsv(file.content, file.name);
    merged.stockTransactions.push(...stockMerge.add(result.stockTransactions));
    merged.cashTransactions.push(...cashMerge.add(result.cashTransactions));
    merged.skipped.push(...result.skipped);
    merged.unrecognized.push(...result.unrecognized);
    merged.errors.push(...result.errors);
    merged.coveredThrough = laterDate(merged.coveredThrough, result.coveredThrough);
  }

  merged.crossFileDuplicates = stockMerge.dropped() + cashMerge.dropped();

  // Sort by date ascending
  merged.stockTransactions.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  merged.cashTransactions.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return merged;
}

/**
 * Merge rows from several files of one upload as a multiset maximum.
 *
 * Within one file identical rows are separate trades and are all kept. Across
 * files a row is the same transaction seen twice (a monthly export plus a YTD
 * export, or one file picked twice), so for each key the merged batch holds as
 * many rows as the file with the most of them: 2 in file A and 2 in file B
 * gives 2, while 1 in A and 3 in B gives 3.
 *
 * `add` takes one file's rows and returns the ones not already covered by the
 * files added before it.
 */
export function createCrossFileMerge<T>(keyOf: (row: T) => string) {
  const kept = new Map<string, number>();
  let dropped = 0;
  return {
    add(rows: T[]): T[] {
      const seenInFile = new Map<string, number>();
      const fresh: T[] = [];
      for (const row of rows) {
        const key = keyOf(row);
        const nth = (seenInFile.get(key) ?? 0) + 1;
        seenInFile.set(key, nth);
        if (nth > (kept.get(key) ?? 0)) {
          kept.set(key, nth);
          fresh.push(row);
        } else {
          dropped++;
        }
      }
      return fresh;
    },
    dropped: () => dropped,
  };
}

/**
 * Convert a Yahoo-formatted symbol back to the raw broker symbol.
 * Reverses toYahooSymbol: strip the venue suffix, convert hyphens back to dots.
 * Examples: TRP.TO → TRP, SRU-UN.TO → SRU.UN, ABC.V → ABC, BRK-B → BRK.B
 */
export function fromYahooSymbol(symbol: string): string {
  const suffix = symbol.match(YAHOO_CANADIAN_SUFFIX);
  const base = suffix ? symbol.slice(0, -suffix[0].length) : symbol;
  return base.replace(/-/g, ".");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse pasted ACB table data (from WealthSimple or broker statement).
 * Looks for known symbols in the pasted text and extracts quantity + book cost.
 * Handles both Yahoo-formatted symbols (TRP.TO) and raw broker symbols (TRP).
 */
export function parseAcbTable(
  pastedText: string,
  knownSymbols: string[]
): Map<string, { quantity: number; bookCost: number }> {
  const result = new Map<string, { quantity: number; bookCost: number }>();

  for (const symbol of knownSymbols) {
    // Try matching with both Yahoo symbol and raw broker symbol
    const rawSymbol = fromYahooSymbol(symbol);
    const candidates = rawSymbol !== symbol ? [rawSymbol, symbol] : [symbol];

    for (const candidate of candidates) {
      // Pattern: SYMBOL followed by quantity, market value, currency, then book cost values
      // Flexible pattern that handles various statement formats
      const pattern = new RegExp(
        escapeRegex(candidate) + String.raw`\s+([\d,.]+)\s+[\d,.]+\s+\$?[\d,.]+\s+[A-Z]{3}\s+\$?[\d,.]+\s+\$?([\d,.]+)`,
        "m"
      );
      const match = pastedText.match(pattern);
      if (match) {
        const quantity = parseFloat(match[1].replace(/,/g, ""));
        const bookCost = parseFloat(match[2].replace(/,/g, ""));
        if (!isNaN(quantity) && !isNaN(bookCost) && quantity > 0) {
          result.set(symbol, { quantity, bookCost });
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Build dedup key for stock transactions.
 * Key: date(YYYY-MM-DD)|symbol|type|shares|price
 *
 * Transfers leave the price out: the file always has 0, while the stored row
 * carries the cost basis the user entered at import, so including it would
 * never match and every re-import would add the transfer again.
 */
export function stockTxnDedupKey(
  date: string | Date,
  symbol: string,
  type: string,
  shares: number,
  price: number
): string {
  const d = date instanceof Date ? date : new Date(date);
  const dateStr = d.toISOString().split("T")[0];
  if (type === "transfer_in") return `${dateStr}|${symbol}|${type}|${shares}`;
  return `${dateStr}|${symbol}|${type}|${shares}|${price}`;
}

/**
 * Split incoming rows into new ones and duplicates of rows already stored.
 *
 * Counts, not a set: two identical fills on the same day are two real trades,
 * so an incoming row is a duplicate only while the stored side still has an
 * unmatched row with the same key. Rows within the incoming batch are never
 * matched against each other.
 */
export function splitDuplicates<T>(
  incoming: T[],
  existingKeys: Iterable<string>,
  keyOf: (row: T) => string
): { fresh: T[]; duplicates: number } {
  const remaining = new Map<string, number>();
  for (const key of existingKeys) remaining.set(key, (remaining.get(key) ?? 0) + 1);

  const fresh: T[] = [];
  let duplicates = 0;
  for (const row of incoming) {
    const key = keyOf(row);
    const left = remaining.get(key) ?? 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      duplicates++;
    } else {
      fresh.push(row);
    }
  }
  return { fresh, duplicates };
}

/**
 * Build dedup key for cash transactions.
 * Key: date(YYYY-MM-DD)|type|amount|currency
 * Currency is included so same-day, same-amount transactions in different
 * currencies (e.g. a $100 CAD and $100 USD deposit) are not collapsed.
 */
export function cashTxnDedupKey(
  date: string | Date,
  type: string,
  amount: number,
  currency: string
): string {
  const d = date instanceof Date ? date : new Date(date);
  const dateStr = d.toISOString().split("T")[0];
  return `${dateStr}|${type}|${amount}|${currency}`;
}
