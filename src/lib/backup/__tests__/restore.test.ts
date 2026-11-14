import { describe, expect, it } from "vitest";
import {
  portfolioIdOfSettingKey,
  restorableAlertRules,
  restorableSettings,
} from "@/lib/backup/restore";

const rule = (over: Partial<{ id: number; scope: string; symbol: string; holdingId: number | null; watchlistItemId: number | null }>) => ({
  id: 1,
  scope: "market",
  symbol: "^GSPC",
  holdingId: null,
  watchlistItemId: null,
  ...over,
});

describe("restorableAlertRules", () => {
  const holdings = new Map([[10, "TD.TO"]]);
  const items = new Map([[20, "AAPL"]]);

  it("keeps market rules and rules whose target exists with the same symbol", () => {
    const rules = [
      rule({ id: 1 }),
      rule({ id: 2, scope: "holding", symbol: "TD.TO", holdingId: 10 }),
      rule({ id: 3, scope: "watchlist", symbol: "aapl", watchlistItemId: 20 }),
    ];
    const { kept, dropped } = restorableAlertRules(rules, holdings, items);
    expect(kept.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(dropped).toEqual([]);
  });

  it("drops a rule whose target is missing or now a different symbol", () => {
    const rules = [
      rule({ id: 4, scope: "holding", symbol: "TD.TO", holdingId: 99 }),
      rule({ id: 5, scope: "holding", symbol: "RY.TO", holdingId: 10 }),
    ];
    const { kept, dropped } = restorableAlertRules(rules, holdings, items);
    expect(kept).toEqual([]);
    expect(dropped.map((r) => r.id)).toEqual([4, 5]);
  });
});

describe("restorableSettings", () => {
  it("keeps global keys and coverage keys only for restored portfolios", () => {
    const settings = [
      { key: "smtp.host", value: '"mail"' },
      { key: "import.coveredThrough.1", value: '"2026-09-30"' },
      { key: "import.coveredThrough.7", value: '"2026-08-31"' },
    ];
    expect(restorableSettings(settings, new Set([1])).map((s) => s.key)).toEqual([
      "smtp.host",
      "import.coveredThrough.1",
    ]);
  });

  it("reads the portfolio id from a scoped key", () => {
    expect(portfolioIdOfSettingKey("import.coveredThrough.12")).toBe(12);
    expect(portfolioIdOfSettingKey("digest.timezone")).toBeNull();
  });
});
