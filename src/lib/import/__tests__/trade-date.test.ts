import { describe, expect, it } from "vitest";
import {
  normalizeSymbol,
  normalizeTradeDate,
  resolveEditedTradeDate,
} from "@/lib/import/trade-date";

describe("normalizeTradeDate", () => {
  it("stores a date-only input at 12:00 UTC, matching imports", () => {
    expect(normalizeTradeDate("2026-09-03")?.toISOString()).toBe("2026-09-03T12:00:00.000Z");
  });

  it("keeps the UTC calendar day of a full ISO timestamp", () => {
    expect(normalizeTradeDate("2026-09-03T00:00:00.000Z")?.toISOString()).toBe(
      "2026-09-03T12:00:00.000Z"
    );
    expect(normalizeTradeDate("2026-09-03T12:00:00Z")?.toISOString()).toBe(
      "2026-09-03T12:00:00.000Z"
    );
  });

  it("rejects garbage and impossible days", () => {
    expect(normalizeTradeDate("not a date")).toBeNull();
    expect(normalizeTradeDate("2026-02-31")).toBeNull();
  });
});

describe("resolveEditedTradeDate", () => {
  const stored = new Date("2026-09-03T12:00:00.000Z");

  it("keeps the stored timestamp when the day is unchanged", () => {
    const edited = resolveEditedTradeDate(stored, normalizeTradeDate("2026-09-03")!);
    expect(edited).toBe(stored);
  });

  it("keeps a legacy midnight timestamp when the day is unchanged", () => {
    const legacy = new Date("2026-09-03T00:00:00.000Z");
    expect(resolveEditedTradeDate(legacy, normalizeTradeDate("2026-09-03")!)).toBe(legacy);
  });

  it("moves to noon on the new day when the day changes", () => {
    const edited = resolveEditedTradeDate(stored, normalizeTradeDate("2026-09-04")!);
    expect(edited.toISOString()).toBe("2026-09-04T12:00:00.000Z");
  });

  it("orders an edited same-day sell after its buy", () => {
    const buy = { id: 1, date: new Date("2026-09-03T12:00:00.000Z") };
    const sell = { id: 2, date: resolveEditedTradeDate(stored, normalizeTradeDate("2026-09-03")!) };
    const ordered = [sell, buy].sort(
      (a, b) => a.date.getTime() - b.date.getTime() || a.id - b.id
    );
    expect(ordered.map((t) => t.id)).toEqual([1, 2]);
  });
});

describe("normalizeSymbol", () => {
  it("trims and upper-cases", () => {
    expect(normalizeSymbol(" td.to ")).toBe("TD.TO");
  });
});
