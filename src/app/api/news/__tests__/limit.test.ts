import { describe, expect, it } from "vitest";
import { DEFAULT_NEWS_LIMIT, MAX_NEWS_LIMIT, parseNewsLimit } from "../limit";

describe("parseNewsLimit", () => {
  it("reads a whole number", () => {
    expect(parseNewsLimit("20")).toBe(20);
  });

  it("falls back to the default for missing or junk values", () => {
    for (const raw of [null, "", "abc", "-3", "0", "2.5", "1e3"]) {
      expect(parseNewsLimit(raw)).toBe(DEFAULT_NEWS_LIMIT);
    }
  });

  it("clamps to the cap", () => {
    expect(parseNewsLimit("10000")).toBe(MAX_NEWS_LIMIT);
  });
});
