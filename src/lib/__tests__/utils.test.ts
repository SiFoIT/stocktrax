import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatPercent,
  getChangeColor,
  localDateString,
  parseCalendarDate,
  toCalendarDate,
} from "../utils";

/**
 * Run these under more than one TZ (e.g. `TZ=America/Toronto npx vitest run`
 * and `TZ=Asia/Tokyo ...`): the date helpers must give the same calendar day
 * whatever the browser's offset.
 */
describe("calendar dates", () => {
  it("keeps a date-only string on its own day", () => {
    expect(toCalendarDate("2026-12-01")).toBe("2026-12-01");
    const d = parseCalendarDate("2026-12-01");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 11, 1]);
    expect(formatDate("2026-12-01")).toContain("1");
    expect(formatDate("2026-12-01")).not.toContain("30");
  });

  it("reads a transaction instant by its UTC date at both 00:00Z and 12:00Z", () => {
    expect(toCalendarDate("2026-03-05T00:00:00.000Z")).toBe("2026-03-05");
    expect(toCalendarDate("2026-03-05T12:00:00.000Z")).toBe("2026-03-05");
    expect(toCalendarDate(new Date("2026-03-05T12:00:00Z"))).toBe("2026-03-05");
    const d = parseCalendarDate("2026-03-05T00:00:00.000Z");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 5]);
  });

  it("formats the day the string names", () => {
    expect(formatDate("2026-12-01")).toBe(
      new Date(2026, 11, 1).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    );
    expect(formatDate(undefined)).toBe("-");
  });

  it("gives today's local date, not the UTC one", () => {
    // 23:30 local on Nov 14 is Nov 15 in UTC anywhere west of Greenwich.
    expect(localDateString(new Date(2026, 10, 14, 23, 30))).toBe("2026-11-14");
    expect(localDateString(new Date(2026, 0, 2, 0, 5))).toBe("2026-01-02");
  });
});

describe("formatPercent", () => {
  it("never prints negative zero", () => {
    expect(formatPercent(-0.001)).toBe("+0.00%");
    expect(formatPercent(-0)).toBe("+0.00%");
    expect(formatPercent(-0.005)).toBe("-0.01%");
    expect(formatPercent(1.234)).toBe("+1.23%");
    expect(formatPercent(undefined)).toBe("-");
  });
});

describe("getChangeColor", () => {
  it("is neutral for zero and missing values", () => {
    expect(getChangeColor(0)).toBe("text-muted-foreground");
    expect(getChangeColor(NaN)).toBe("text-muted-foreground");
    expect(getChangeColor(null)).toBe("text-muted-foreground");
    expect(getChangeColor(undefined)).toBe("text-muted-foreground");
    expect(getChangeColor(0.01)).toBe("text-positive");
    expect(getChangeColor(-0.01)).toBe("text-negative");
  });
});

describe("formatCurrency", () => {
  it("keeps the USD and CAD prefixes", () => {
    expect(formatCurrency(1234.5, "USD")).toMatch(/^US\$1,?234\.50$/);
    expect(formatCurrency(1234.5, "CAD")).toMatch(/^C\$1,?234\.50$/);
  });

  it("never prints a bare dollar sign for another currency", () => {
    expect(formatCurrency(10, "EUR")).not.toMatch(/^\$/);
    expect(formatCurrency(10, "EUR")).toContain("€");
    expect(formatCurrency(10, "GBP")).toContain("£");
  });

  it("shows pence for GBp", () => {
    expect(formatCurrency(1234.5, "GBp")).toMatch(/^1,?234\.50p$/);
  });

  it("falls back to the code for a non-ISO currency", () => {
    expect(formatCurrency(5, "XYZ1")).toBe("5.00 XYZ1");
  });
});
