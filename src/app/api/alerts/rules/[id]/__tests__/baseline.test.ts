import { describe, expect, it } from "vitest";
import { shouldClearBaseline } from "../baseline";

const stored = { anchorValue: 100, resetStrategy: "baseline" };

describe("shouldClearBaseline", () => {
  it("keeps the baseline when the form resends unchanged values", () => {
    expect(shouldClearBaseline(stored, { anchorValue: 100, resetStrategy: "baseline" })).toBe(false);
  });

  it("keeps the baseline when neither field is sent", () => {
    expect(shouldClearBaseline(stored, {})).toBe(false);
  });

  it("clears it when the anchor changes", () => {
    expect(shouldClearBaseline(stored, { anchorValue: 105, resetStrategy: "baseline" })).toBe(true);
    expect(shouldClearBaseline(stored, { anchorValue: null })).toBe(true);
  });

  it("clears it when the reset strategy changes", () => {
    expect(shouldClearBaseline(stored, { resetStrategy: "manual" })).toBe(true);
  });

  it("treats a missing stored anchor and a null patch as equal", () => {
    expect(shouldClearBaseline({ anchorValue: null, resetStrategy: "manual" }, { anchorValue: null })).toBe(false);
  });
});
