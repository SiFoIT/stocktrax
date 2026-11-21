import { describe, it, expect } from "vitest";
import { ExtendedHoursData } from "@/types";
import { selectExtendedHours } from "../extended-hours";

const afterClose: ExtendedHoursData = {
  marketState: "CLOSED",
  postMarketPrice: 697.49,
  postMarketChange: 7.68,
  postMarketChangePercent: 1.11,
  postMarketTime: "2026-11-21T00:59:00.000Z",
};

describe("selectExtendedHours", () => {
  it("shows nothing during regular hours, when the live price already says it", () => {
    expect(selectExtendedHours({ ...afterClose, marketState: "REGULAR" })).toBeNull();
  });

  it("is the after-hours print once the day is closed, and all weekend", () => {
    expect(selectExtendedHours(afterClose)).toEqual({
      label: "After:",
      price: 697.49,
      change: 7.68,
      changePercent: 1.11,
      time: "2026-11-21T00:59:00.000Z",
    });
  });

  it("calls the session still running Post rather than After", () => {
    expect(selectExtendedHours({ ...afterClose, marketState: "POST" })?.label).toBe("Post:");
    expect(selectExtendedHours({ ...afterClose, marketState: "POSTPOST" })?.label).toBe("Post:");
  });

  it("prefers the pre-market print as the next session approaches", () => {
    const move = selectExtendedHours({
      ...afterClose,
      marketState: "PRE",
      preMarketPrice: 700.1,
      preMarketChangePercent: 0.37,
    });
    expect(move).toMatchObject({ label: "Pre:", price: 700.1, changePercent: 0.37 });
  });

  it("has nothing to show when Yahoo sent no print for the state it reports", () => {
    expect(selectExtendedHours({ marketState: "PRE" })).toBeNull();
    expect(selectExtendedHours({ marketState: "CLOSED" })).toBeNull();
    expect(selectExtendedHours(undefined)).toBeNull();
  });
});
