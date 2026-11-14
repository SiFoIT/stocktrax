import { describe, expect, it } from "vitest";
import { compareMissingLast } from "../sort";

const sortValues = (values: (number | undefined)[], dir: "asc" | "desc") =>
  [...values].sort((a, b) => compareMissingLast(a, b, dir));

describe("compareMissingLast", () => {
  it("never returns NaN when both values are missing", () => {
    expect(compareMissingLast(undefined, undefined, "asc")).toBe(0);
    expect(compareMissingLast(NaN, null, "desc")).toBe(0);
  });

  it("puts missing values last in both directions", () => {
    expect(sortValues([3, undefined, 1, undefined, 2], "asc")).toEqual([1, 2, 3, undefined, undefined]);
    expect(sortValues([3, undefined, 1, undefined, 2], "desc")).toEqual([3, 2, 1, undefined, undefined]);
  });

  it("keeps infinities and zero as real values", () => {
    expect(sortValues([0, undefined, -Infinity], "asc")).toEqual([-Infinity, 0, undefined]);
  });
});
