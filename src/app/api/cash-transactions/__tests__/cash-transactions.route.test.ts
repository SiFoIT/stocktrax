import { beforeEach, describe, expect, it } from "vitest";
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
import { DELETE, PATCH } from "../route";

let portfolioId: number;

beforeEach(() => {
  resetDatabase();
  portfolioId = seedPortfolio().id;
});

function seedCash(amount: number, date = "2026-03-02") {
  return db
    .insert(schema.cashTransactions)
    .values({
      portfolioId,
      type: "deposit",
      description: "Deposit",
      amount,
      currency: "CAD",
      date: new Date(`${date}T12:00:00Z`),
    })
    .returning()
    .get();
}

describe("cash transaction writes drop the cached summary", () => {
  it("on a single delete", async () => {
    const row = seedCash(100);
    seedSummaryCache();
    const res = await DELETE(apiRequest("DELETE", `/api/cash-transactions?id=${row.id}`));
    expect(res.status).toBe(200);
    expect(summaryCached()).toBe(false);
  });

  it("on a batch delete and a delete-all", async () => {
    const a = seedCash(100);
    const b = seedCash(200);
    seedSummaryCache();
    const batch = await DELETE(apiRequest("DELETE", "/api/cash-transactions", { ids: [a.id, b.id] }));
    expect((await readJson(batch)).deleted).toBe(2);
    expect(summaryCached()).toBe(false);

    seedCash(300);
    seedSummaryCache();
    const all = await DELETE(apiRequest("DELETE", `/api/cash-transactions?portfolioId=${portfolioId}&all=true`));
    expect((await readJson(all)).deleted).toBe(1);
    expect(summaryCached()).toBe(false);
    expect(db.select().from(schema.cashTransactions).all()).toHaveLength(0);
  });

  it("on a PATCH, which keeps the stored timestamp when the day is unchanged", async () => {
    const row = seedCash(100);
    seedSummaryCache();
    const res = await PATCH(
      apiRequest("PATCH", `/api/cash-transactions?id=${row.id}`, { amount: 150, date: "2026-03-02" })
    );
    expect(res.status).toBe(200);
    expect((await readJson(res)).transaction).toMatchObject({ amount: 150, date: "2026-03-02T12:00:00.000Z" });
    expect(summaryCached()).toBe(false);
  });

  it("but not on a delete or PATCH of an unknown id", async () => {
    seedSummaryCache();
    expect((await DELETE(apiRequest("DELETE", "/api/cash-transactions?id=9999"))).status).toBe(404);
    expect((await PATCH(apiRequest("PATCH", "/api/cash-transactions?id=9999", { amount: 1 }))).status).toBe(404);
    expect(summaryCached()).toBe(true);
  });
});
