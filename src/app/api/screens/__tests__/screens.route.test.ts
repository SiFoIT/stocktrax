import { beforeEach, describe, expect, it } from "vitest";
import { apiRequest, db, readJson, resetDatabase, schema } from "@/test/route-helpers";
import { PATCH } from "../route";

beforeEach(() => {
  resetDatabase();
});

describe("PATCH /api/screens", () => {
  it("updates a screen and leaves its run stats alone", async () => {
    const screen = db
      .insert(schema.screens)
      .values({ name: "Old", lastMatchCount: 3, lastTotalScanned: 30, lastRunAt: new Date("2026-03-01T00:00:00Z") })
      .returning()
      .get();
    const res = await PATCH(apiRequest("PATCH", `/api/screens?id=${screen.id}`, { name: "New", match: "any" }));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({
      id: screen.id,
      name: "New",
      match: "any",
      lastMatchCount: 3,
      lastTotalScanned: 30,
      lastRunAt: "2026-03-01T00:00:00.000Z",
    });
  });

  it("returns 404 for an unknown id and 400 for a non-numeric one", async () => {
    const missing = await PATCH(apiRequest("PATCH", "/api/screens?id=9999", { name: "New" }));
    expect(missing.status).toBe(404);
    expect(await readJson(missing)).toEqual({ error: "Screen not found" });

    expect((await PATCH(apiRequest("PATCH", "/api/screens?id=abc", { name: "New" }))).status).toBe(400);
  });
});
