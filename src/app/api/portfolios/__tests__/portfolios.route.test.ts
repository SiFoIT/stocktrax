import { beforeEach, describe, expect, it } from "vitest";
import {
  apiRequest,
  readJson,
  resetDatabase,
  seedPortfolio,
  seedSummaryCache,
  summaryCached,
} from "@/test/route-helpers";
import { PATCH } from "../route";

beforeEach(() => {
  resetDatabase();
});

describe("PATCH /api/portfolios", () => {
  it("renames a portfolio and drops the cached summary", async () => {
    const portfolio = seedPortfolio({ name: "Old" });
    seedSummaryCache();
    const res = await PATCH(apiRequest("PATCH", `/api/portfolios?id=${portfolio.id}`, { name: "New" }));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ id: portfolio.id, name: "New" });
    expect(summaryCached()).toBe(false);
  });

  it("returns 404 for an unknown id and keeps the cached summary", async () => {
    seedSummaryCache();
    const res = await PATCH(apiRequest("PATCH", "/api/portfolios?id=9999", { name: "New" }));
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: "Portfolio not found" });
    expect(summaryCached()).toBe(true);
  });
});
