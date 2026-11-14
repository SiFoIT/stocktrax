// Alert rule create/update (rules/route.ts, rules/[id]/route.ts) and the
// evaluator run (run/route.ts) against a real database.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  alertRuleById,
  apiRequest,
  db,
  readJson,
  resetDatabase,
  routeParams,
  schema,
  seedWatchlist,
  seedWatchlistItem,
} from "@/test/route-helpers";

const getQuote = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/yahoo-finance", () => ({ getQuote }));

import { GET, POST } from "../route";
import { DELETE as deleteRule, PATCH as patchRule } from "../[id]/route";
import { POST as runAlerts } from "../../run/route";

let itemId: number;

beforeEach(() => {
  resetDatabase();
  getQuote.mockReset();
  // Default: the quote is unavailable, as when Yahoo is down.
  getQuote.mockRejectedValue(new Error("quote unavailable"));
  itemId = seedWatchlistItem(seedWatchlist().id, "NVDA").id;
});

const baseRule = {
  scope: "watchlist",
  symbol: "nvda",
  metric: "price_vs_anchor",
  operator: "lte",
  threshold: -10,
  resetStrategy: "baseline",
} as const;

async function createRule(body: Record<string, unknown>) {
  const res = await POST(apiRequest("POST", "/api/alerts/rules", { watchlistItemId: itemId, ...body }));
  return { res, body: await readJson(res) };
}

function patch(id: number | string, body: Record<string, unknown>) {
  return patchRule(apiRequest("PATCH", `/api/alerts/rules/${id}`, body), routeParams({ id: String(id) }));
}

function run(price: number | null) {
  return runAlerts(
    apiRequest("POST", "/api/alerts/run", {
      scope: "watchlist",
      items: [{ id: itemId, watchlistId: 1, symbol: "NVDA", price, changePercent: 0 }],
    })
  );
}

describe("POST /api/alerts/rules", () => {
  it("sets a blank anchor from the quote, upper-cases the symbol and seeds the baseline", async () => {
    getQuote.mockResolvedValue({ symbol: "NVDA", price: 150 });

    const { res, body } = await createRule({ ...baseRule, anchorValue: null });
    expect(res.status).toBe(201);
    expect(getQuote).toHaveBeenCalledWith("NVDA");
    expect(body).toMatchObject({ symbol: "NVDA", anchorValue: 150, baselineValue: 150, cooldownMinutes: 60 });
    expect(alertRuleById(body.id)).toMatchObject({ anchorValue: 150, baselineValue: 150 });
  });

  it("uses a given anchor without asking for a quote", async () => {
    const { body } = await createRule({ ...baseRule, anchorValue: 120 });
    expect(getQuote).not.toHaveBeenCalled();
    expect(body).toMatchObject({ anchorValue: 120, baselineValue: 120 });
  });

  it("leaves the anchor null when the quote fails or is zero", async () => {
    getQuote.mockRejectedValueOnce(new Error("offline"));
    expect((await createRule(baseRule)).body).toMatchObject({ anchorValue: null, baselineValue: null });

    getQuote.mockResolvedValueOnce({ symbol: "NVDA", price: 0 });
    expect((await createRule(baseRule)).body).toMatchObject({ anchorValue: null, baselineValue: null });
  });

  it("does not fetch a quote for other metrics and only baselines baseline rules", async () => {
    const { body } = await createRule({ ...baseRule, metric: "last_price", resetStrategy: "cooldown", threshold: 100 });
    expect(getQuote).not.toHaveBeenCalled();
    expect(body).toMatchObject({ anchorValue: null, baselineValue: null });
  });

  it("rejects an unknown metric", async () => {
    expect((await createRule({ ...baseRule, metric: "volume" })).res.status).toBe(400);
  });

  it("lists rules filtered by watchlist item", async () => {
    await createRule({ ...baseRule, anchorValue: 100 });
    const other = seedWatchlistItem(seedWatchlist("Other").id, "AMD");
    await POST(apiRequest("POST", "/api/alerts/rules", { ...baseRule, symbol: "AMD", anchorValue: 100, watchlistItemId: other.id }));

    const res = await GET(apiRequest("GET", `/api/alerts/rules?watchlistItemId=${itemId}`));
    expect((await readJson(res)).map((r: { symbol: string }) => r.symbol)).toEqual(["NVDA"]);
  });
});

describe("PATCH /api/alerts/rules/[id]", () => {
  it("keeps the baseline when only the cooldown changes", async () => {
    const { body: rule } = await createRule({ ...baseRule, anchorValue: 100 });
    db.update(schema.alertRules).set({ baselineValue: 130 }).run();

    const res = await patch(rule.id, { cooldownMinutes: 15 });
    expect(res.status).toBe(200);
    expect(alertRuleById(rule.id)).toMatchObject({ cooldownMinutes: 15, baselineValue: 130, anchorValue: 100 });
  });

  it("keeps the baseline when the edit form resends the unchanged anchor and strategy", async () => {
    const { body: rule } = await createRule({ ...baseRule, anchorValue: 100 });
    db.update(schema.alertRules).set({ baselineValue: 130 }).run();

    await patch(rule.id, { threshold: -5, anchorValue: 100, resetStrategy: "baseline", cooldownMinutes: 60 });
    expect(alertRuleById(rule.id)).toMatchObject({ threshold: -5, baselineValue: 130 });
  });

  it("clears the baseline when the anchor changes", async () => {
    const { body: rule } = await createRule({ ...baseRule, anchorValue: 100 });
    db.update(schema.alertRules).set({ baselineValue: 130 }).run();

    await patch(rule.id, { anchorValue: 110 });
    expect(alertRuleById(rule.id)).toMatchObject({ anchorValue: 110, baselineValue: null });
  });

  it("clears the baseline when the reset strategy changes", async () => {
    const { body: rule } = await createRule({ ...baseRule, anchorValue: 100 });
    await patch(rule.id, { resetStrategy: "cooldown" });
    expect(alertRuleById(rule.id)).toMatchObject({ resetStrategy: "cooldown", baselineValue: null });
  });

  it("re-arms a muted rule on reset", async () => {
    const { body: rule } = await createRule({ ...baseRule, anchorValue: 100 });
    db.update(schema.alertRules).set({ isMuted: true, needsRecovery: true, cooldownUntil: new Date(Date.now() + 3_600_000) }).run();

    await patch(rule.id, { action: "reset" });
    expect(alertRuleById(rule.id)).toMatchObject({ isMuted: false, needsRecovery: false, cooldownUntil: null });
  });

  it("returns 404 for an unknown id and 400 for a non-numeric one", async () => {
    const missing = await patch(9999, { cooldownMinutes: 15 });
    expect(missing.status).toBe(404);
    expect(await readJson(missing)).toEqual({ error: "Alert rule not found" });

    expect((await patch("abc", { cooldownMinutes: 15 })).status).toBe(400);
  });

  it("deletes a rule", async () => {
    const { body: rule } = await createRule({ ...baseRule, anchorValue: 100 });
    const res = await deleteRule(apiRequest("DELETE", `/api/alerts/rules/${rule.id}`), routeParams({ id: String(rule.id) }));
    expect(res.status).toBe(200);
    expect(alertRuleById(rule.id)).toBeUndefined();
  });
});

describe("POST /api/alerts/run", () => {
  it("never fires or sets a reference from a zero or missing price", async () => {
    const { body: rule } = await createRule(baseRule); // quote unavailable → no anchor
    expect(rule.anchorValue).toBeNull();

    for (const price of [0, null]) {
      const res = await run(price);
      expect(res.status).toBe(200);
      expect((await readJson(res)).alerts).toEqual([]);
      expect(alertRuleById(rule.id)).toMatchObject({ anchorValue: null, baselineValue: null });
    }
  });

  // A client's NaN reaches the route as null (JSON.stringify), covered above.
  // A raw NaN token is not JSON: readJsonBody turns it into null, which fails
  // validation like any other bad body.
  it("rejects a raw NaN body with a 400 without touching the rule", async () => {
    const { body: rule } = await createRule({ ...baseRule, anchorValue: 100 });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runAlerts(
      new NextRequest("http://localhost/api/alerts/run", {
        method: "POST",
        body: `{"scope":"watchlist","items":[{"id":${itemId},"watchlistId":1,"symbol":"NVDA","price":NaN}]}`,
      })
    );
    consoleError.mockRestore();
    expect(res.status).toBe(400);
    expect(alertRuleById(rule.id)).toMatchObject({ anchorValue: 100, baselineValue: 100, lastTriggeredAt: null });
    expect(db.select().from(schema.alerts).all()).toHaveLength(0);
  });

  it("does not fire on a zero price against an existing anchor", async () => {
    const { body: rule } = await createRule({ ...baseRule, anchorValue: 100 });
    // 0 would be a -100% move and cross the -10% threshold if it were trusted.
    expect((await readJson(await run(0))).alerts).toEqual([]);
    expect(alertRuleById(rule.id)).toMatchObject({ baselineValue: 100, lastTriggeredAt: null });
  });

  it("takes the first good price as the reference, then fires and re-baselines", async () => {
    const { body: rule } = await createRule(baseRule);

    expect((await readJson(await run(200))).alerts).toEqual([]);
    expect(alertRuleById(rule.id)).toMatchObject({ anchorValue: 200, baselineValue: 200 });

    const fired = await readJson(await run(170));
    expect(fired.alerts).toHaveLength(1);
    expect(fired.alerts[0]).toMatchObject({ ruleId: rule.id, symbol: "NVDA", price: 170, metricValue: -15 });
    expect(alertRuleById(rule.id)).toMatchObject({ baselineValue: 170 });
    expect(alertRuleById(rule.id)!.lastTriggeredAt).toBeInstanceOf(Date);
  });
});
