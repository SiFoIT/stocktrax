import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  apiRequest,
  db,
  holdingById,
  readJson,
  resetDatabase,
  schema,
  seedPortfolio,
  seedSummaryCache,
  summaryCached,
} from "@/test/route-helpers";
import { DELETE, GET, PATCH, POST } from "../route";

let portfolioId: number;

beforeEach(() => {
  resetDatabase();
  portfolioId = seedPortfolio({ currency: "USD" }).id;
});

function post(body: Record<string, unknown>) {
  return POST(apiRequest("POST", "/api/transactions", { portfolioId, ...body }));
}

function patch(id: number, body: Record<string, unknown>) {
  return PATCH(apiRequest("PATCH", `/api/transactions?id=${id}`, body));
}

function storedTxn(id: number) {
  return db.select().from(schema.transactions).where(eq(schema.transactions.id, id)).get()!;
}

describe("POST /api/transactions", () => {
  it("stores a buy at 12:00 UTC and recomputes the holding", async () => {
    const res = await post({ symbol: "AAPL", type: "buy", shares: 10, price: 100, date: "2026-03-02" });
    expect(res.status).toBe(201);
    const body = await readJson(res);

    expect(body.transaction.date).toBe("2026-03-02T12:00:00.000Z");
    expect(storedTxn(body.transaction.id).date.toISOString()).toBe("2026-03-02T12:00:00.000Z");
    expect(body.holding).toMatchObject({ symbol: "AAPL", shares: 10, avgCost: 100, currency: "USD" });

    const second = await post({ symbol: "AAPL", type: "buy", shares: 10, price: 200, date: "2026-03-03" });
    expect((await readJson(second)).holding).toMatchObject({ shares: 20, avgCost: 150 });
  });

  it("normalises a full ISO timestamp to noon UTC of its calendar day", async () => {
    const res = await post({ symbol: "AAPL", type: "buy", shares: 1, price: 1, date: "2026-03-02T03:15:00Z" });
    expect((await readJson(res)).transaction.date).toBe("2026-03-02T12:00:00.000Z");
  });

  it("reduces shares on a sell and keeps the average cost", async () => {
    await post({ symbol: "AAPL", type: "buy", shares: 10, price: 100, date: "2026-03-02" });
    await post({ symbol: "AAPL", type: "buy", shares: 10, price: 200, date: "2026-03-03" });
    const res = await post({ symbol: "AAPL", type: "sell", shares: 5, price: 300, date: "2026-03-04" });

    expect(res.status).toBe(201);
    expect((await readJson(res)).holding).toMatchObject({ shares: 15, avgCost: 150 });
  });

  it("trims and upper-cases the symbol so it lands on one holding", async () => {
    await post({ symbol: " aapl ", type: "buy", shares: 1, price: 10, date: "2026-03-02" });
    const res = await post({ symbol: "AAPL", type: "buy", shares: 1, price: 10, date: "2026-03-03" });

    expect((await readJson(res)).holding).toMatchObject({ symbol: "AAPL", shares: 2 });
    expect(db.select().from(schema.holdings).all()).toHaveLength(1);
  });

  it("rejects a blank symbol", async () => {
    const res = await post({ symbol: "   ", type: "buy", shares: 1, price: 10, date: "2026-03-02" });
    expect(res.status).toBe(400);
  });

  it("rejects a negative price except on a dividend", async () => {
    await post({ symbol: "AAPL", type: "buy", shares: 1, price: 10, date: "2026-03-02" });

    const buy = await post({ symbol: "AAPL", type: "buy", shares: 1, price: -1, date: "2026-03-03" });
    expect(buy.status).toBe(400);
    expect(JSON.stringify(await readJson(buy))).toContain("Price must be non-negative");

    const dividend = await post({ symbol: "AAPL", type: "dividend", shares: 1, price: -0.25, date: "2026-03-03" });
    expect(dividend.status).toBe(201);
  });

  it("rejects an impossible date and a sell of an unowned symbol", async () => {
    const badDate = await post({ symbol: "AAPL", type: "buy", shares: 1, price: 10, date: "2026-02-31" });
    expect(badDate.status).toBe(400);

    const sell = await post({ symbol: "MSFT", type: "sell", shares: 1, price: 10, date: "2026-03-02" });
    expect(sell.status).toBe(400);
    expect(db.select().from(schema.holdings).all()).toHaveLength(0);
  });
});

describe("PATCH /api/transactions", () => {
  it("keeps a same-day buy-then-sell in order when the sell's price is edited", async () => {
    const buy = await readJson(await post({ symbol: "AAPL", type: "buy", shares: 50, price: 10, date: "2026-03-02" }));
    const sell = await readJson(await post({ symbol: "AAPL", type: "sell", shares: 50, price: 12, date: "2026-03-02" }));
    expect(sell.holding.shares).toBe(0);

    // The edit form always resends the date; an unchanged day must not move
    // the sell ahead of the buy.
    const res = await patch(sell.transaction.id, { price: 13, date: "2026-03-02" });
    expect(res.status).toBe(200);
    const body = await readJson(res);

    expect(body.holding.shares).toBe(0);
    expect(holdingById(buy.holding.id)!.shares).toBe(0);
    expect(storedTxn(sell.transaction.id)).toMatchObject({ price: 13 });
    expect(storedTxn(sell.transaction.id).date.toISOString()).toBe("2026-03-02T12:00:00.000Z");
  });

  it("moves the trade when the day changes", async () => {
    await post({ symbol: "AAPL", type: "buy", shares: 10, price: 100, date: "2026-03-02" });
    const late = await readJson(await post({ symbol: "AAPL", type: "buy", shares: 10, price: 200, date: "2026-03-05" }));
    const sell = await readJson(await post({ symbol: "AAPL", type: "sell", shares: 10, price: 150, date: "2026-03-03" }));
    // Sold the first lot outright, then rebought at 200.
    expect(sell.holding).toMatchObject({ shares: 10, avgCost: 200 });

    // Move the second buy before the sell: the sell now leaves half of a
    // 150-average position.
    const res = await patch(late.transaction.id, { date: "2026-03-01" });
    const body = await readJson(res);

    expect(storedTxn(late.transaction.id).date.toISOString()).toBe("2026-03-01T12:00:00.000Z");
    expect(body.holding).toMatchObject({ shares: 10, avgCost: 150 });
  });

  it("rejects a negative price on a non-dividend and allows it on a dividend", async () => {
    const buy = await readJson(await post({ symbol: "AAPL", type: "buy", shares: 1, price: 10, date: "2026-03-02" }));
    const dividend = await readJson(
      await post({ symbol: "AAPL", type: "dividend", shares: 1, price: 0.5, date: "2026-03-03" })
    );

    expect((await patch(buy.transaction.id, { price: -1 })).status).toBe(400);
    expect(storedTxn(buy.transaction.id).price).toBe(10);

    expect((await patch(dividend.transaction.id, { price: -0.5 })).status).toBe(200);
    expect(storedTxn(dividend.transaction.id).price).toBe(-0.5);

    // Turning a negative dividend into a buy without fixing the price is refused.
    expect((await patch(dividend.transaction.id, { type: "buy" })).status).toBe(400);
  });

  it("returns 404 for an unknown id", async () => {
    expect((await patch(9999, { price: 1 })).status).toBe(404);
  });
});

describe("DELETE /api/transactions", () => {
  it("recomputes the holding after a single delete", async () => {
    await post({ symbol: "AAPL", type: "buy", shares: 10, price: 100, date: "2026-03-02" });
    const second = await readJson(await post({ symbol: "AAPL", type: "buy", shares: 10, price: 200, date: "2026-03-03" }));

    const res = await DELETE(apiRequest("DELETE", `/api/transactions?id=${second.transaction.id}`));
    expect(res.status).toBe(200);
    expect((await readJson(res)).holding).toMatchObject({ shares: 10, avgCost: 100 });
  });

  it("recomputes every affected holding after a batch delete", async () => {
    const a = await readJson(await post({ symbol: "AAPL", type: "buy", shares: 10, price: 100, date: "2026-03-02" }));
    const m = await readJson(await post({ symbol: "MSFT", type: "buy", shares: 5, price: 300, date: "2026-03-02" }));

    const res = await DELETE(
      apiRequest("DELETE", "/api/transactions", { ids: [a.transaction.id, m.transaction.id] })
    );
    expect((await readJson(res)).deleted).toBe(2);
    expect(holdingById(a.holding.id)).toMatchObject({ shares: 0, avgCost: 0 });
    expect(holdingById(m.holding.id)).toMatchObject({ shares: 0, avgCost: 0 });
  });

  it("returns 404 for an unknown id", async () => {
    expect((await DELETE(apiRequest("DELETE", "/api/transactions?id=9999"))).status).toBe(404);
  });
});

describe("summary cache invalidation", () => {
  it("drops the cached summary on every successful write", async () => {
    seedSummaryCache();
    const created = await readJson(
      await post({ symbol: "AAPL", type: "buy", shares: 1, price: 10, date: "2026-03-02" })
    );
    expect(summaryCached()).toBe(false);

    seedSummaryCache();
    await patch(created.transaction.id, { price: 11 });
    expect(summaryCached()).toBe(false);

    seedSummaryCache();
    await DELETE(apiRequest("DELETE", `/api/transactions?id=${created.transaction.id}`));
    expect(summaryCached()).toBe(false);
  });

  it("keeps the cached summary when a write is rejected", async () => {
    seedSummaryCache();
    await post({ symbol: "AAPL", type: "buy", shares: 1, price: -10, date: "2026-03-02" });
    await patch(9999, { price: 1 });
    expect(summaryCached()).toBe(true);
  });
});

describe("GET /api/transactions", () => {
  it("lists a portfolio's transactions newest first with symbol and currency", async () => {
    await post({ symbol: "AAPL", type: "buy", shares: 1, price: 10, date: "2026-03-02" });
    await post({ symbol: "MSFT", type: "buy", shares: 1, price: 10, date: "2026-03-04" });

    const res = await GET(apiRequest("GET", `/api/transactions?portfolioId=${portfolioId}`));
    const body = await readJson(res);
    expect(body.map((t: { symbol: string }) => t.symbol)).toEqual(["MSFT", "AAPL"]);
    expect(body[0]).toMatchObject({ currency: "USD", date: "2026-03-04T12:00:00.000Z" });
  });
});
