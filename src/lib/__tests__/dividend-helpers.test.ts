import { describe, it, expect } from "vitest";
import { getDaysToExDiv } from "../dividend-helpers";

describe("getDaysToExDiv", () => {
  it("is 0 on the ex-dividend day itself, at any hour", () => {
    expect(getDaysToExDiv("2026-12-01", new Date(2026, 11, 1, 0, 1))).toBe(0);
    expect(getDaysToExDiv("2026-12-01", new Date(2026, 11, 1, 21, 0))).toBe(0);
  });

  it("counts calendar days both ways", () => {
    expect(getDaysToExDiv("2026-12-01", new Date(2026, 10, 30, 23, 0))).toBe(1);
    expect(getDaysToExDiv("2026-12-01", new Date(2026, 11, 2, 9, 0))).toBe(-1);
    // Across the November DST change.
    expect(getDaysToExDiv("2026-11-10", new Date(2026, 10, 1, 12, 0))).toBe(9);
  });

  it("is undefined without a date", () => {
    expect(getDaysToExDiv(undefined)).toBeUndefined();
  });
});
