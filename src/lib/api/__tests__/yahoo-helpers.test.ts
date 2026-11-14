import { describe, expect, it } from "vitest";
import { barDay, dividendFields } from "../yahoo-finance";
import { closeOnOrBeforeDay } from "@/lib/returns";

describe("barDay", () => {
  it("keeps a Toronto/New York bar on its own day", () => {
    // Daily bars are stamped at the 9:30 ET open.
    expect(barDay(new Date("2026-11-06T14:30:00Z"), -18000)).toBe("2026-11-06");
    expect(barDay(new Date("2026-07-06T13:30:00Z"), -14400)).toBe("2026-07-06");
  });

  it("moves a Sydney bar stamped the previous UTC evening to its session day", () => {
    expect(barDay(new Date("2026-11-10T23:00:00Z"), 39600)).toBe("2026-11-11");
  });

  it("gives the weekly digest Friday's close, not Thursday's (the T.TO -8% bug)", () => {
    const bars = [
      { day: barDay(new Date("2026-11-05T14:30:00Z"), -18000), close: 13.19 },
      { day: barDay(new Date("2026-11-06T14:30:00Z"), -18000), close: 12.81 },
    ];
    expect(closeOnOrBeforeDay(bars, "2026-11-06")).toBe(12.81);
  });
});

describe("dividendFields", () => {
  it("passes stock fields through", () => {
    expect(dividendFields({ dividendRate: 1.68, dividendYield: 0.032 })).toEqual({
      dividendRate: 1.68,
      dividendYield: 0.032,
    });
  });

  it("derives an ETF's rate from its yield", () => {
    const f = dividendFields({ yield: 0.0161, previousClose: 45.58 });
    expect(f.dividendYield).toBe(0.0161);
    expect(f.dividendRate).toBeCloseTo(0.7338, 3);
  });

  it("is empty with nothing to go on", () => {
    expect(dividendFields({})).toEqual({});
    expect(dividendFields(undefined)).toEqual({});
  });
});
