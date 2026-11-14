import { beforeEach, describe, expect, it } from "vitest";
import {
  apiRequest,
  db,
  holdingById,
  resetDatabase,
  schema,
  seedHolding,
  seedPortfolio,
  seedSummaryCache,
  summaryCached,
} from "@/test/route-helpers";
import { DELETE } from "../route";

beforeEach(() => {
  resetDatabase();
});

describe("DELETE /api/holdings", () => {
  it("deletes the holding with its transactions and drops the cached summary", async () => {
    const holding = seedHolding(seedPortfolio().id, { shares: 1, avgCost: 10 });
    db.insert(schema.transactions)
      .values({ holdingId: holding.id, type: "buy", shares: 1, price: 10, date: new Date("2026-03-02T12:00:00Z") })
      .run();
    seedSummaryCache();

    const res = await DELETE(apiRequest("DELETE", `/api/holdings?id=${holding.id}`));
    expect(res.status).toBe(200);
    expect(holdingById(holding.id)).toBeUndefined();
    expect(db.select().from(schema.transactions).all()).toHaveLength(0);
    expect(summaryCached()).toBe(false);
  });

  it("keeps the cached summary when the id is missing", async () => {
    seedSummaryCache();
    expect((await DELETE(apiRequest("DELETE", "/api/holdings"))).status).toBe(400);
    expect(summaryCached()).toBe(true);
  });
});
