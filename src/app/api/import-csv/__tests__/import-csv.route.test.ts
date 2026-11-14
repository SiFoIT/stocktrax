import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  apiRequest,
  db,
  readJson,
  resetDatabase,
  schema,
  seedPortfolio,
  seedSummaryCache,
  summaryCached,
} from "@/test/route-helpers";
import { POST } from "../route";

let portfolioId: number;

beforeEach(() => {
  resetDatabase();
  portfolioId = seedPortfolio().id;
});

// The shape the CSV import modal posts: rows already parsed client-side by
// parseMultipleFiles, dates as ISO strings.
type StockRow = {
  type: "buy" | "sell" | "dividend" | "transfer_in";
  symbol: string;
  shares: number;
  price: number;
  date: string;
  currency: string;
};
type CashRow = {
  type: "contribution" | "deposit" | "refund" | "referral" | "transfer_in" | "transfer_out" | "fx_conversion";
  description: string;
  amount: number;
  date: string;
  currency: string;
};

function importRows(stockTransactions: StockRow[], cashTransactions: CashRow[] = [], extra = {}) {
  return POST(
    apiRequest("POST", "/api/import-csv", { portfolioId, stockTransactions, cashTransactions, ...extra })
  );
}

const buy = (over: Partial<StockRow> = {}): StockRow => ({
  type: "buy",
  symbol: "TD.TO",
  shares: 10,
  price: 80,
  date: "2026-03-02T00:00:00.000Z",
  currency: "CAD",
  ...over,
});

const deposit: CashRow = {
  type: "deposit",
  description: "Deposit",
  amount: 1000,
  date: "2026-03-01T00:00:00.000Z",
  currency: "CAD",
};

function stockTxns() {
  return db.select().from(schema.transactions).all();
}

describe("POST /api/import-csv", () => {
  it("imports rows at 12:00 UTC, recomputes the holding and adds nothing on re-import", async () => {
    const rows = [buy(), buy({ type: "sell", shares: 4, price: 90, date: "2026-03-05T00:00:00.000Z" })];

    const first = await readJson(await importRows(rows, [deposit]));
    expect(first).toMatchObject({ stockImported: 2, cashImported: 1, duplicatesSkipped: 0, errors: [] });
    expect(stockTxns().map((t) => t.date.toISOString())).toEqual([
      "2026-03-02T12:00:00.000Z",
      "2026-03-05T12:00:00.000Z",
    ]);
    const holding = db.select().from(schema.holdings).get()!;
    expect(holding).toMatchObject({ symbol: "TD.TO", shares: 6, avgCost: 80, currency: "CAD" });

    const second = await readJson(await importRows(rows, [deposit]));
    expect(second).toMatchObject({ stockImported: 0, cashImported: 0, duplicatesSkipped: 3 });
    expect(stockTxns()).toHaveLength(2);
    expect(db.select().from(schema.cashTransactions).all()).toHaveLength(1);
  });

  it("keeps two identical fills in one import, and a re-import adds neither", async () => {
    const first = await readJson(await importRows([buy(), buy()]));
    expect(first.stockImported).toBe(2);
    expect(db.select().from(schema.holdings).get()!.shares).toBe(20);

    const second = await readJson(await importRows([buy(), buy()]));
    expect(second).toMatchObject({ stockImported: 0, duplicatesSkipped: 2 });
  });

  it("adds only the extra fill when a later file has one more identical row", async () => {
    await importRows([buy()]);
    const res = await readJson(await importRows([buy(), buy()]));
    expect(res).toMatchObject({ stockImported: 1, duplicatesSkipped: 1 });
    expect(stockTxns()).toHaveLength(2);
  });

  it("imports a negative dividend (a reversal)", async () => {
    const res = await importRows([
      buy(),
      buy({ type: "dividend", shares: 1, price: 5, date: "2026-03-10T00:00:00.000Z" }),
      buy({ type: "dividend", shares: 1, price: -5, date: "2026-03-11T00:00:00.000Z" }),
    ]);
    expect(res.status).toBe(200);
    expect((await readJson(res)).stockImported).toBe(3);
    expect(stockTxns().map((t) => t.price)).toContain(-5);
  });

  it("dedups a transfer against the stored row whatever its price", async () => {
    const transfer = buy({ type: "transfer_in", shares: 7, price: 0 });
    await importRows([transfer]);
    // The user set a cost basis on the stored transfer after the first import.
    const stored = stockTxns()[0];
    db.update(schema.transactions)
      .set({ price: 42 })
      .where(eq(schema.transactions.id, stored.id))
      .run();

    const res = await readJson(await importRows([transfer]));
    expect(res).toMatchObject({ stockImported: 0, duplicatesSkipped: 1 });
    expect(stockTxns()).toHaveLength(1);
  });

  it("does not dedup a buy whose price differs", async () => {
    await importRows([buy()]);
    const res = await readJson(await importRows([buy({ price: 81 })]));
    expect(res.stockImported).toBe(1);
  });

  it("upper-cases and trims symbols onto the existing holding", async () => {
    await importRows([buy()]);
    const res = await readJson(await importRows([buy({ symbol: " td.to ", date: "2026-03-03T00:00:00.000Z" })]));
    expect(res.stockImported).toBe(1);
    expect(db.select().from(schema.holdings).all()).toHaveLength(1);
  });

  it("gives a readable 400 naming the bad row", async () => {
    const res = await importRows([buy(), buy({ type: "buy", price: -3 })]);
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("Stock row 2 (price): Price must be non-negative");
    expect(stockTxns()).toHaveLength(0);

    const badDate = await readJson(
      await importRows([], [{ ...deposit, date: "not a date" }])
    );
    expect(badDate.error).toBe("Cash row 1 (date): Invalid date");
  });

  it("returns 404 for an unknown portfolio", async () => {
    const res = await POST(
      apiRequest("POST", "/api/import-csv", { portfolioId: 9999, stockTransactions: [buy()], cashTransactions: [] })
    );
    expect(res.status).toBe(404);
  });

  it("drops the cached summary only when something was imported", async () => {
    seedSummaryCache();
    await importRows([buy()]);
    expect(summaryCached()).toBe(false);

    seedSummaryCache();
    await importRows([buy()]);
    expect(summaryCached()).toBe(true);
  });

  it("records coverage and only moves it forward", async () => {
    await importRows([buy()], [], { coveredThrough: "2026-03-31" });
    await importRows([], [], { coveredThrough: "2026-02-28" });
    const setting = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, `import.coveredThrough.${portfolioId}`))
      .get();
    expect(JSON.parse(setting!.value)).toBe("2026-03-31");
  });
});
