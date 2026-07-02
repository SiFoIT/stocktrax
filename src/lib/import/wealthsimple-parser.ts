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
  // Also accept already-capitalized headers
  Date: "Date",
  Type: "Type",
  Description: "Description",
  Amount: "Amount",
  Balance: "Balance",
  Currency: "Currency",
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

function parseAmount(amountStr: string): number {
  // Remove $ and commas, parse as float
  return parseFloat(amountStr.replace(/[$,]/g, ""));
}

/**
 * Convert a raw broker symbol to Yahoo Finance format for Canadian stocks.
 * CAD stocks on TSX need ".TO" suffix, and dots in the symbol become hyphens.
 * .U suffix is a TSX convention for USD-denominated stocks (e.g. HISU.U → HISU-U.TO).
 * Examples: TD → TD.TO, SRU.UN → SRU-UN.TO, NA → NA.TO, HISU.U → HISU-U.TO
 */
export function toYahooSymbol(symbol: string, currency: string): string {
  if (symbol.endsWith(".TO")) return symbol;
  const isTsx = currency === "CAD" || /\.U$/i.test(symbol);
  if (isTsx) {
    return symbol.replace(/\./g, "-") + ".TO";
  }
  return symbol;
}

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
  const amount = parseAmount(row.Amount || "0");
  const currency = row.Currency || "CAD";
  const date = parseWsDate(row.Date);

  if (wsType === "BUY") {
    const match = desc.match(BUY_PATTERN);
    if (!match) return null;
    const effectiveCurrency = /\.U$/i.test(match[1]) ? "USD" : currency;
    const symbol = toYahooSymbol(match[1], currency);
    const shares = parseShares(match[2]);
    const price = shares > 0 ? Math.abs(amount) / shares : 0;
    return { type: "buy", symbol, shares, price, date, currency: effectiveCurrency, rawDescription: desc };
  }

  if (wsType === "SELL") {
    const match = desc.match(SELL_PATTERN);
    if (!match) return null;
    const effectiveCurrency = /\.U$/i.test(match[1]) ? "USD" : currency;
    const symbol = toYahooSymbol(match[1], currency);
    const shares = parseShares(match[2]);
    const price = shares > 0 ? Math.abs(amount) / shares : 0;
    return { type: "sell", symbol, shares, price, date, currency: effectiveCurrency, rawDescription: desc };
  }

  if (wsType === "DIV") {
    const match = desc.match(DIV_PATTERN);
    if (!match) return null;
    const effectiveCurrency = /\.U$/i.test(match[1]) ? "USD" : currency;
    const symbol = toYahooSymbol(match[1], currency);
    // Preserve sign: negative amounts are dividend reversals/corrections and
    // must reduce recorded income, not add to it.
    return { type: "dividend", symbol, shares: 1, price: amount, date, currency: effectiveCurrency, rawDescription: desc };
  }

  if (wsType === "TRFIN") {
    const match = desc.match(TRFIN_PATTERN);
    if (!match) return null;
    const effectiveCurrency = /\.U$/i.test(match[1]) ? "USD" : currency;
    const symbol = toYahooSymbol(match[1], currency);
    const shares = parseShares(match[2]);
    return { type: "transfer_in", symbol, shares, price: 0, date, currency: effectiveCurrency, rawDescription: desc };
  }

  if (wsType === "STKDIS") {
    const match = desc.match(STKDIS_PATTERN);
    if (!match) return null;
    const effectiveCurrency = /\.U$/i.test(match[1]) ? "USD" : currency;
    const symbol = toYahooSymbol(match[1], currency);
    const shares = parseShares(match[2]);
    return { type: "transfer_in", symbol, shares, price: 0, date, currency: effectiveCurrency, rawDescription: desc };
  }

  return null;
}

function parseCashRow(row: CsvRow): ParsedCashTransaction | null {
  const wsType = row.Type;
  const cashType = CASH_TYPE_MAP[wsType];
  if (!cashType) return null;

  const amount = parseAmount(row.Amount || "0");
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

    // Skip intentionally ignored types
    if (SKIP_TYPES.has(wsType)) {
      result.skipped.push({
        wsType,
        description: row.Description,
        date: row.Date,
      });
      continue;
    }

    // TRFIN can be stock transfer OR cash transfer
    if (wsType === "TRFIN") {
      const stockTxn = parseStockRow(row);
      if (stockTxn) {
        result.stockTransactions.push(stockTxn);
      } else {
        // Cash money transfer (e.g. "Money transfer into the account")
        const amount = parseAmount(row.Amount || "0");
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
    if (["BUY", "SELL", "DIV", "STKDIS"].includes(wsType)) {
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
  };

  for (const file of files) {
    const result = parseWealthSimpleCsv(file.content, file.name);
    merged.stockTransactions.push(...result.stockTransactions);
    merged.cashTransactions.push(...result.cashTransactions);
    merged.skipped.push(...result.skipped);
    merged.unrecognized.push(...result.unrecognized);
    merged.errors.push(...result.errors);
  }

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
 * Convert a Yahoo-formatted symbol back to the raw broker symbol.
 * Reverses toYahooSymbol: strip .TO suffix, convert hyphens back to dots.
 * Examples: TRP.TO → TRP, SRU-UN.TO → SRU.UN, HISU-U.TO → HISU.U
 */
function fromYahooSymbol(symbol: string): string {
  if (symbol.endsWith(".TO")) {
    return symbol.slice(0, -3).replace(/-/g, ".");
  }
  return symbol;
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
  return `${dateStr}|${symbol}|${type}|${shares}|${price}`;
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
