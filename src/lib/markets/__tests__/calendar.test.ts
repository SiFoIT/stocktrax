import { describe, expect, it } from "vitest";
import { getTsxHolidays, isTsxTradingDay } from "../calendar";

describe("TSX holidays", () => {
  it("lists the 2026 holidays", () => {
    expect([...getTsxHolidays(2026)].sort()).toEqual([
      "2026-01-01", // New Year's Day
      "2026-02-16", // Family Day
      "2026-04-03", // Good Friday
      "2026-05-18", // Victoria Day
      "2026-07-01", // Canada Day
      "2026-08-03", // Civic Holiday
      "2026-09-07", // Labour Day
      "2026-10-12", // Thanksgiving
      "2026-12-25", // Christmas (Friday)
      "2026-12-28", // Boxing Day, Saturday → Monday
    ]);
  });

  it("moves a weekend Christmas and Boxing Day to Monday and Tuesday", () => {
    const h = getTsxHolidays(2027);
    expect(h.has("2027-12-27")).toBe(true);
    expect(h.has("2027-12-28")).toBe(true);
  });

  it("trades on US-only holidays", () => {
    expect(isTsxTradingDay("2026-11-26")).toBe(true); // US Thanksgiving
    expect(isTsxTradingDay("2026-01-19")).toBe(true); // MLK Day
    expect(isTsxTradingDay("2026-08-03")).toBe(false);
  });
});
