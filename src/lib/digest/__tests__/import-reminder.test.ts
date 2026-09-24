import { describe, expect, it } from "vitest";
import {
  isReminderEnabled,
  lastMonthName,
  lastMonthStart,
  selectImportReminder,
  type PortfolioCoverage,
} from "@/lib/digest/import-reminder";

const lira: PortfolioCoverage = {
  id: 3,
  name: "LIRA",
  coveredThrough: "2026-08-10",
  source: "import",
};

describe("last month", () => {
  it("steps back within the year", () => {
    expect(lastMonthStart("2026-10-15")).toBe("2026-09-01");
    expect(lastMonthName("2026-10-15")).toBe("September");
  });

  it("rolls January back to December of the year before", () => {
    expect(lastMonthStart("2027-01-20")).toBe("2026-12-01");
    expect(lastMonthName("2027-01-20")).toBe("December");
  });
});

describe("selectImportReminder", () => {
  it("stays quiet before the 15th", () => {
    expect(selectImportReminder("2026-10-14", [lira], {})).toBeNull();
  });

  it("starts on the 15th when last month has no activity", () => {
    expect(selectImportReminder("2026-10-15", [lira], {})).toEqual({
      month: "September",
      portfolios: [{ id: 3, name: "LIRA", coveredThrough: "2026-08-10" }],
    });
  });

  it("counts any activity in last month as imported", () => {
    const imported = { ...lira, coveredThrough: "2026-09-02" };
    expect(selectImportReminder("2026-10-20", [imported], {})).toBeNull();
  });

  it("is quiet when last month is covered as of this month", () => {
    // August covered on Sep 24 — September is not due until Oct 15.
    expect(selectImportReminder("2026-09-24", [lira], {})).toBeNull();
  });

  it("flags a portfolio several months behind", () => {
    const behind = { ...lira, coveredThrough: "2026-01-30" };
    expect(selectImportReminder("2026-09-24", [behind], {})?.portfolios).toHaveLength(1);
  });

  it("leaves out a portfolio switched off", () => {
    expect(selectImportReminder("2026-10-15", [lira], { "3": false })).toBeNull();
  });

  it("never includes an empty portfolio unless switched on", () => {
    const empty: PortfolioCoverage = { id: 7, name: "New", coveredThrough: null, source: "none" };
    expect(selectImportReminder("2026-10-15", [empty], {})).toBeNull();
    expect(selectImportReminder("2026-10-15", [empty], { "7": true })?.portfolios).toEqual([
      { id: 7, name: "New", coveredThrough: null },
    ]);
  });
});

describe("isReminderEnabled", () => {
  it("defaults on for any portfolio with activity", () => {
    expect(isReminderEnabled({ ...lira, source: "transactions" }, {})).toBe(true);
  });

  it("lets an explicit choice win", () => {
    expect(isReminderEnabled(lira, { "3": false })).toBe(false);
  });
});
