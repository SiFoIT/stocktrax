import { describe, expect, it } from "vitest";
import { annualized, modifiedDietz, simulateBenchmark } from "../performance-math";

describe("modifiedDietz", () => {
  it("is the simple return with no flows", () => {
    expect(modifiedDietz(1000, 1100, [], "2026-01-01", "2026-12-31")).toBeCloseTo(10, 6);
  });

  it("does not count a deposit as gain", () => {
    // 1000 at start, 1000 more halfway, ends at 2100: the gain is 100 on
    // ~1500 of average capital.
    const r = modifiedDietz(1000, 2100, [{ day: "2026-07-02", amount: 1000 }], "2026-01-01", "2026-12-31")!;
    expect(r).toBeGreaterThan(6);
    expect(r).toBeLessThan(7);
  });

  it("is null with nothing invested", () => {
    expect(modifiedDietz(0, 0, [], "2026-01-01", "2026-12-31")).toBeNull();
  });
});

describe("annualized", () => {
  it("is 10% for one deposit that grew 10% in a year", () => {
    expect(annualized([{ day: "2025-01-01", amount: 1000 }], 1100, "2026-01-01")).toBeCloseTo(10, 1);
  });
});

describe("simulateBenchmark", () => {
  const closes: Record<string, number> = { "2026-01-02": 10, "2026-01-05": 11, "2026-01-06": 12 };
  const closeOn = (day: string) => {
    const keys = Object.keys(closes).filter((d) => d <= day).sort();
    return keys.length ? closes[keys[keys.length - 1]] : null;
  };

  it("buys units with each flow at that day's close", () => {
    const days = ["2026-01-02", "2026-01-05", "2026-01-06"];
    const values = simulateBenchmark(
      [
        { day: "2026-01-02", amount: 100 }, // 10 units
        { day: "2026-01-05", amount: 110 }, // 10 more
      ],
      days,
      closeOn
    );
    expect(values).toEqual([100, 220, 240]);
  });

  it("holds a flow made before the benchmark's history as cash until it starts", () => {
    const values = simulateBenchmark([{ day: "2025-12-30", amount: 50 }], ["2025-12-31", "2026-01-02"], closeOn);
    expect(values).toEqual([50, 50]);
  });

  it("sells units for a withdrawal", () => {
    const values = simulateBenchmark(
      [
        { day: "2026-01-02", amount: 100 },
        { day: "2026-01-06", amount: -60 },
      ],
      ["2026-01-02", "2026-01-06"],
      closeOn
    );
    expect(values[1]).toBeCloseTo(120 - 60, 6);
  });
});
