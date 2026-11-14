import { beforeEach, describe, expect, it } from "vitest";
import { apiRequest, readJson, resetDatabase, seedWatchlist } from "@/test/route-helpers";
import { PATCH } from "../route";

beforeEach(() => {
  resetDatabase();
});

describe("PATCH /api/watchlists", () => {
  it("renames a watchlist", async () => {
    const watchlist = seedWatchlist("Old");
    const res = await PATCH(apiRequest("PATCH", `/api/watchlists?id=${watchlist.id}`, { name: "New" }));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ id: watchlist.id, name: "New" });
  });

  it("returns 404 for an unknown id", async () => {
    const res = await PATCH(apiRequest("PATCH", "/api/watchlists?id=9999", { name: "New" }));
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: "Watchlist not found" });
  });
});
