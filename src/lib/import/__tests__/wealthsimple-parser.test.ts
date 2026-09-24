import { describe, expect, it } from "vitest";
import { parseMultipleFiles, parseWealthSimpleCsv } from "@/lib/import/wealthsimple-parser";

const HEADER = "date,transaction,description,amount,balance,currency";

describe("coveredThrough", () => {
  it("counts skipped and unrecognized rows", () => {
    const csv = [
      HEADER,
      "2026-09-03,CONT,Contribution,500,500,CAD",
      "2026-09-28,LOAN,Securities lending,0,500,CAD",
      "2026-09-30,MYSTERY,Something new,1,501,CAD",
    ].join("\n");
    expect(parseWealthSimpleCsv(csv).coveredThrough).toBe("2026-09-30");
  });

  it("is null when no row has a date", () => {
    expect(parseWealthSimpleCsv(HEADER).coveredThrough).toBeNull();
  });

  it("takes the latest across files", () => {
    const aug = `${HEADER}\n2026-08-15,CONT,Contribution,1,1,CAD`;
    const sep = `${HEADER}\n2026-09-12,CONT,Contribution,1,2,CAD`;
    const merged = parseMultipleFiles([
      { name: "sep.csv", content: sep },
      { name: "aug.csv", content: aug },
    ]);
    expect(merged.coveredThrough).toBe("2026-09-12");
  });
});
