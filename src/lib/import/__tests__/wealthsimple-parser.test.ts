import { describe, expect, it } from "vitest";
import {
  cashTxnDedupKey,
  createCrossFileMerge,
  fromYahooSymbol,
  parseAmount,
  parseMultipleFiles,
  parseWealthSimpleCsv,
  splitDuplicates,
  stockTxnDedupKey,
  toYahooSymbol,
} from "@/lib/import/wealthsimple-parser";

const HEADER = "date,transaction,description,amount,balance,currency";

describe("coveredThrough", () => {
  it("counts skipped and unrecognized rows", () => {
    const csv = [
      HEADER,
      "2026-09-03,CONT,Contribution,500,500,CAD",
      "2026-09-28,LOAN,Securities lending,0,500,CAD",
      "2026-09-30,MYSTERY,Something new,1,501,CAD",
    ].join("\n");
    expect(parseWealthSimpleCsv(csv).coveredThrough).toBe("2026-09-30");
  });

  it("is null when no row has a date", () => {
    expect(parseWealthSimpleCsv(HEADER).coveredThrough).toBeNull();
  });

  it("takes the latest across files", () => {
    const aug = `${HEADER}\n2026-08-15,CONT,Contribution,1,1,CAD`;
    const sep = `${HEADER}\n2026-09-12,CONT,Contribution,1,2,CAD`;
    const merged = parseMultipleFiles([
      { name: "sep.csv", content: sep },
      { name: "aug.csv", content: aug },
    ]);
    expect(merged.coveredThrough).toBe("2026-09-12");
  });
});

describe("parseAmount", () => {
  it("reads plain, signed, currency-marked and accounting-style amounts", () => {
    expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount("-12.50")).toBe(-12.5);
    expect(parseAmount("(12.50)")).toBe(-12.5);
    expect(parseAmount("($1,234.56)")).toBe(-1234.56);
    expect(parseAmount("$1,234.56")).toBe(1234.56);
    expect(parseAmount("-$12.50")).toBe(-12.5);
    expect(parseAmount("CA$12.50")).toBe(12.5);
    expect(parseAmount("12.50 CAD")).toBe(12.5);
    expect(parseAmount("−12.50")).toBe(-12.5);
  });

  it("treats an empty cell as 0 and garbage as NaN", () => {
    expect(parseAmount("")).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount("n/a")).toBeNaN();
    expect(parseAmount("12.5.3")).toBeNaN();
  });
});

describe("amount handling in rows", () => {
  it("imports an accounting-style negative instead of failing", () => {
    const csv = `${HEADER}\n2026-09-03,BUY,"TD - Toronto-Dominion Bank: Bought 2.0000 shares (executed at 2026-09-03)",(150.00),0,CAD`;
    const result = parseWealthSimpleCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.stockTransactions[0]).toMatchObject({ symbol: "TD.TO", shares: 2, price: 75 });
  });

  it("rejects only the row with an unreadable amount, with a clear message", () => {
    const csv = [
      HEADER,
      "2026-09-03,CONT,Contribution,abc,0,CAD",
      "2026-09-04,CONT,Contribution,500,500,CAD",
    ].join("\n");
    const result = parseWealthSimpleCsv(csv);
    expect(result.cashTransactions).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('"abc"');
    expect(result.errors[0]).toContain("2026-09-03");
  });

  it("keeps a dividend reversal negative", () => {
    const csv = `${HEADER}\n2026-09-03,DIV,"TD - Toronto-Dominion Bank: Cash dividend distribution, received on 2026-09-03",-10.20,0,CAD`;
    const [div] = parseWealthSimpleCsv(csv).stockTransactions;
    expect(div).toMatchObject({ type: "dividend", shares: 1, price: -10.2 });
  });
});

describe("stock distributions", () => {
  it("marks STKDIS shares as a $0 distribution, unlike a TRFIN transfer", () => {
    const csv = [
      HEADER,
      '2026-09-01,TRFIN,"SHOP - Shopify Inc: Transfer of 10.0000 shares",0,0,CAD',
      '2026-09-02,STKDIS,"SHOP - Shopify Inc: Distribution of 90.0000 shares",0,0,CAD',
    ].join("\n");
    const [transfer, split] = parseWealthSimpleCsv(csv).stockTransactions;
    expect(transfer).toMatchObject({ type: "transfer_in", shares: 10, price: 0 });
    expect(transfer.isDistribution).toBeUndefined();
    expect(split).toMatchObject({ type: "transfer_in", shares: 90, price: 0, isDistribution: true });
  });
});

describe("toYahooSymbol", () => {
  it("defaults CAD trades to the TSX, hyphenating classes and units", () => {
    expect(toYahooSymbol("TD", "CAD")).toBe("TD.TO");
    expect(toYahooSymbol("RCI.B", "CAD")).toBe("RCI-B.TO");
    expect(toYahooSymbol("SRU.UN", "CAD")).toBe("SRU-UN.TO");
    expect(toYahooSymbol("HISU.U", "USD")).toBe("HISU-U.TO");
  });

  it("keeps an existing venue suffix instead of appending .TO", () => {
    expect(toYahooSymbol("ABC.V", "CAD")).toBe("ABC.V");
    expect(toYahooSymbol("XYZ.NE", "CAD")).toBe("XYZ.NE");
    expect(toYahooSymbol("LEAF.CN", "CAD")).toBe("LEAF.CN");
    expect(toYahooSymbol("TD.TO", "CAD")).toBe("TD.TO");
    expect(toYahooSymbol("RCI.B.TO", "CAD")).toBe("RCI-B.TO");
  });

  it("uses the exchange column when the export has one", () => {
    expect(toYahooSymbol("ABC", "CAD", "TSXV")).toBe("ABC.V");
    expect(toYahooSymbol("AAPL", "CAD", "NEO")).toBe("AAPL.NE");
    expect(toYahooSymbol("AAPL", "CAD", "Cboe Canada")).toBe("AAPL.NE");
    expect(toYahooSymbol("LEAF", "CAD", "CSE")).toBe("LEAF.CN");
    expect(toYahooSymbol("SHOP", "USD", "NYSE")).toBe("SHOP");
    expect(toYahooSymbol("SHOP", "CAD", "NYSE")).toBe("SHOP");
  });

  it("writes US share classes with a hyphen", () => {
    expect(toYahooSymbol("BRK.B", "USD")).toBe("BRK-B");
    expect(toYahooSymbol("BF/B", "USD")).toBe("BF-B");
    expect(toYahooSymbol("AAPL", "USD")).toBe("AAPL");
  });

  it("reads the exchange column from the CSV", () => {
    const csv = [
      "date,transaction,description,amount,balance,currency,exchange",
      '2026-09-03,BUY,"ABC - Abc Mining: Bought 100.0000 shares (executed at 2026-09-03)",-50.00,0,CAD,TSXV',
    ].join("\n");
    expect(parseWealthSimpleCsv(csv).stockTransactions[0].symbol).toBe("ABC.V");
  });
});

describe("fromYahooSymbol", () => {
  it("reverses the venue suffix and class hyphen", () => {
    expect(fromYahooSymbol("SRU-UN.TO")).toBe("SRU.UN");
    expect(fromYahooSymbol("ABC.V")).toBe("ABC");
    expect(fromYahooSymbol("BRK-B")).toBe("BRK.B");
    expect(fromYahooSymbol("AAPL")).toBe("AAPL");
  });
});

describe("dedup", () => {
  const key = (t: { date: string; symbol: string; type: string; shares: number; price: number }) =>
    stockTxnDedupKey(t.date, t.symbol, t.type, t.shares, t.price);
  const fill = { date: "2026-09-03T12:00:00.000Z", symbol: "TD.TO", type: "buy", shares: 10, price: 80 };

  it("matches a re-imported transfer whatever cost basis was entered", () => {
    const stored = key({ ...fill, type: "transfer_in", price: 42.17 });
    const incoming = { ...fill, type: "transfer_in", price: 0 };
    expect(splitDuplicates([incoming], [stored], key)).toEqual({ fresh: [], duplicates: 1 });
  });

  it("keeps identical fills within one file", () => {
    const result = splitDuplicates([fill, { ...fill }], [], key);
    expect(result.fresh).toHaveLength(2);
    expect(result.duplicates).toBe(0);
  });

  it("dedups only as many identical rows as are already stored", () => {
    const result = splitDuplicates([fill, { ...fill }, { ...fill }], [key(fill)], key);
    expect(result.fresh).toHaveLength(2);
    expect(result.duplicates).toBe(1);
  });

  it("imports nothing when every identical row is already stored", () => {
    const result = splitDuplicates([fill, { ...fill }], [key(fill), key(fill)], key);
    expect(result).toEqual({ fresh: [], duplicates: 2 });
  });

  it("separates cash rows by currency", () => {
    const usd = cashTxnDedupKey("2026-09-03", "deposit", 100, "USD");
    const cad = cashTxnDedupKey("2026-09-03", "deposit", 100, "CAD");
    expect(usd).not.toBe(cad);
  });
});

describe("parseMultipleFiles cross-file merge", () => {
  const STOCK_HEADER = "date,transaction,description,amount,balance,currency";
  const buy = "2026-09-03,BUY,TD - Toronto-Dominion Bank: Bought 10.0000 shares (executed at 2026-09-03),-800,0,CAD";
  const cont = "2026-09-04,CONT,Contribution,500,500,CAD";

  it("keeps identical fills within one file", () => {
    const csv = [STOCK_HEADER, buy, buy, cont, cont].join("\n");
    const single = parseWealthSimpleCsv(csv);
    const merged = parseMultipleFiles([{ name: "a.csv", content: csv }]);
    expect(single.stockTransactions).toHaveLength(2);
    expect(merged.stockTransactions).toHaveLength(2);
    expect(merged.cashTransactions).toHaveLength(2);
    expect(merged.crossFileDuplicates).toBe(0);
  });

  it("imports a file picked twice once", () => {
    const csv = [STOCK_HEADER, buy, buy, cont].join("\n");
    const single = parseWealthSimpleCsv(csv);
    const merged = parseMultipleFiles([
      { name: "a.csv", content: csv },
      { name: "a copy.csv", content: csv },
    ]);
    expect(merged.stockTransactions).toHaveLength(single.stockTransactions.length);
    expect(merged.cashTransactions).toHaveLength(1);
    expect(merged.crossFileDuplicates).toBe(single.stockTransactions.length + 1);
  });

  it("takes the multiset max across overlapping files", () => {
    const monthly = [STOCK_HEADER, cont, cont].join("\n");
    const ytd = [STOCK_HEADER, "2026-08-01,CONT,Contribution,500,0,CAD", cont, cont, cont].join("\n");
    const merged = parseMultipleFiles([
      { name: "sep.csv", content: monthly },
      { name: "ytd.csv", content: ytd },
    ]);
    const sep4 = merged.cashTransactions.filter((t) => t.date.startsWith("2026-09-04"));
    expect(sep4).toHaveLength(3);
    expect(merged.cashTransactions).toHaveLength(4);
  });
});

describe("createCrossFileMerge", () => {
  it("keeps the larger per-file count of each key", () => {
    const merge = createCrossFileMerge<string>((s) => s);
    expect(merge.add(["a", "a", "b"])).toEqual(["a", "a", "b"]);
    expect(merge.add(["a", "a", "b", "b", "c"])).toEqual(["b", "c"]);
    expect(merge.add(["a", "a", "a"])).toEqual(["a"]);
    expect(merge.dropped()).toBe(5);
  });
});
