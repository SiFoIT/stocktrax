import { describe, expect, it } from "vitest";
import type { AlertRule } from "@/lib/db/schema";
import { evaluateAlerts, referencePrice, validPrice } from "@/lib/alerts/evaluate";

function rule(over: Partial<AlertRule> = {}): AlertRule {
  const now = new Date("2026-09-03T15:00:00Z");
  return {
    id: 1,
    scope: "market",
    watchlistItemId: null,
    holdingId: null,
    symbol: "^GSPC",
    metric: "last_price",
    operator: "lte",
    threshold: 100,
    resetStrategy: "cooldown",
    anchorValue: null,
    cooldownMinutes: 60,
    baselineValue: null,
    needsRecovery: false,
    isMuted: false,
    cooldownUntil: null,
    lastTriggeredAt: null,
    lastResetAt: now,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

const market = (price: number | null, changePercent: number | null = 0) => ({
  scope: "market" as const,
  items: [{ symbol: "^GSPC", price, changePercent }],
});

describe("price guards", () => {
  it("validPrice rejects missing, zero, negative and non-finite prices", () => {
    expect(validPrice(null)).toBeNull();
    expect(validPrice(undefined)).toBeNull();
    expect(validPrice(0)).toBeNull();
    expect(validPrice(-1)).toBeNull();
    expect(validPrice(Number.NaN)).toBeNull();
    expect(validPrice(Infinity)).toBeNull();
    expect(validPrice(12.5)).toBe(12.5);
  });

  it("never fires a price rule on a failed quote", () => {
    for (const price of [0, null, Number.NaN]) {
      const { triggered, updates } = evaluateAlerts(market(price), [rule()]);
      expect(triggered).toEqual([]);
      expect(updates).toEqual([]);
    }
  });

  it("does not evaluate a daily-change rule without a price either", () => {
    const r = rule({ metric: "daily_change_percent", operator: "lte", threshold: 1 });
    expect(evaluateAlerts(market(0, 0), [r]).triggered).toEqual([]);
  });

  it("fires on a real price", () => {
    expect(evaluateAlerts(market(90), [rule()]).triggered).toHaveLength(1);
  });
});

describe("price_vs_anchor", () => {
  const anchorRule = (over: Partial<AlertRule> = {}) =>
    rule({ metric: "price_vs_anchor", operator: "gte", threshold: 5, ...over });

  it("measures from the anchor, not the live price", () => {
    const { triggered } = evaluateAlerts(market(110), [anchorRule({ anchorValue: 100 })]);
    expect(triggered).toHaveLength(1);
    expect(triggered[0].metricValue).toBeCloseTo(10);
  });

  it("seeds a missing anchor from the first good price instead of reading 0%", () => {
    const { triggered, updates } = evaluateAlerts(market(110), [anchorRule()]);
    expect(triggered).toEqual([]);
    expect(updates).toEqual([{ id: 1, anchorValue: 110, baselineValue: null }]);
  });

  it("treats a zero baseline as unset and falls back to the anchor", () => {
    const r = anchorRule({ resetStrategy: "baseline", baselineValue: 0, anchorValue: 100 });
    expect(referencePrice(r)).toBe(100);
    expect(evaluateAlerts(market(110), [r]).triggered).toHaveLength(1);
  });

  it("re-baselines a rule whose baseline and anchor are both unusable", () => {
    const r = anchorRule({ resetStrategy: "baseline", baselineValue: 0, anchorValue: null });
    const { triggered, updates } = evaluateAlerts(market(110), [r]);
    expect(triggered).toEqual([]);
    expect(updates).toEqual([{ id: 1, anchorValue: 110, baselineValue: 110 }]);
  });

  it("never stores a zero baseline after triggering", () => {
    const r = anchorRule({ resetStrategy: "baseline", anchorValue: 100 });
    const { updates } = evaluateAlerts(market(110), [r]);
    expect(updates[0].baselineValue).toBe(110);
  });
});
