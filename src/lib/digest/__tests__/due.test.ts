import { describe, expect, it } from "vitest";
import { decideDue } from "@/lib/digest/due";
import type { DigestConfig } from "@/lib/settings";
import { digestWeek, formatRangeLabel, mostRecentFriday, zonedDateStr, zonedTimeStr } from "@/lib/digest/time";

const config: DigestConfig = {
  dailyEnabled: true,
  weeklyEnabled: true,
  dailyTime: "17:00",
  weeklyTime: "08:00",
  timezone: "America/Toronto",
  watchlistMovePct: 2,
  showDollars: true,
  skipQuietDays: false,
  quietThresholdPct: 0.5,
  appUrl: "",
};

// 2026-09-08 is a Tuesday; 2026-09-12 a Saturday; 2026-09-07 US Labor Day.
const TUESDAY = "2026-09-08";
const SATURDAY = "2026-09-12";
const LABOR_DAY = "2026-09-07";

function due(over: Partial<Parameters<typeof decideDue>[0]> = {}) {
  return decideDue({
    today: TUESDAY,
    nowTime: "17:00",
    config,
    lastDaily: null,
    lastWeekly: null,
    ...over,
  });
}

describe("decideDue", () => {
  it("sends the daily once the scheduled time passes on a trading day", () => {
    expect(due().daily).toBe(true);
  });

  it("waits until the scheduled time", () => {
    expect(due({ nowTime: "16:59" }).daily).toBe(false);
  });

  it("does not send twice on the same day", () => {
    expect(due({ lastDaily: TUESDAY }).daily).toBe(false);
  });

  it("catches up later the same evening after a restart", () => {
    expect(due({ nowTime: "19:30" }).daily).toBe(true);
  });

  it("skips a missed daily rather than sending it after midnight", () => {
    const nextMorning = due({ today: "2026-09-09", nowTime: "00:30", lastDaily: null });
    expect(nextMorning.daily).toBe(false);
    expect(nextMorning.snapshot).toBe(false);
  });

  it("stays quiet on a market holiday", () => {
    const holiday = due({ today: LABOR_DAY });
    expect(holiday.daily).toBe(false);
    expect(holiday.snapshot).toBe(false);
  });

  it("stays quiet at the weekend", () => {
    expect(due({ today: SATURDAY }).daily).toBe(false);
  });

  it("records a snapshot even when the daily email is switched off", () => {
    const decision = due({ config: { ...config, dailyEnabled: false } });
    expect(decision.daily).toBe(false);
    expect(decision.snapshot).toBe(true);
  });

  it("sends the weekly on Saturday morning", () => {
    expect(due({ today: SATURDAY, nowTime: "08:00" }).weekly).toBe(true);
  });

  it("does not send the weekly before its time, or twice", () => {
    expect(due({ today: SATURDAY, nowTime: "07:59" }).weekly).toBe(false);
    expect(due({ today: SATURDAY, nowTime: "09:00", lastWeekly: SATURDAY }).weekly).toBe(false);
  });

  it("does not send the weekly on any other day", () => {
    expect(due({ today: TUESDAY, nowTime: "23:00" }).weekly).toBe(false);
  });

  it("sends nothing when both digests are disabled", () => {
    const decision = due({
      today: SATURDAY,
      nowTime: "09:00",
      config: { ...config, dailyEnabled: false, weeklyEnabled: false },
    });
    expect(decision.daily).toBe(false);
    expect(decision.weekly).toBe(false);
  });
});

describe("week boundaries", () => {
  it("reports the Monday to Friday that just ended, and the Friday before it", () => {
    expect(digestWeek(SATURDAY)).toEqual({
      start: "2026-09-07",
      end: "2026-09-11",
      baseline: "2026-09-04",
    });
  });

  it("describes a complete week when run midweek", () => {
    expect(mostRecentFriday("2026-09-09")).toBe("2026-09-04");
  });

  it("collapses the month when a week does not cross one", () => {
    expect(formatRangeLabel("2026-09-07", "2026-09-11")).toBe("Sep 7 – 11, 2026");
    expect(formatRangeLabel("2026-08-31", "2026-09-04")).toBe("Aug 31 – Sep 4, 2026");
  });
});

describe("timezone handling", () => {
  it("reads the wall clock in the configured zone, not the container's", () => {
    // 21:30 UTC is 17:30 in Toronto on that date, so the daily is due there.
    const instant = new Date("2026-09-08T21:30:00Z");
    expect(zonedDateStr(instant, "America/Toronto")).toBe("2026-09-08");
    expect(zonedTimeStr(instant, "America/Toronto")).toBe("17:30");
    expect(zonedTimeStr(instant, "UTC")).toBe("21:30");
  });

  it("rolls the date back for a zone still on the previous day", () => {
    const instant = new Date("2026-09-09T02:00:00Z");
    expect(zonedDateStr(instant, "America/Toronto")).toBe("2026-09-08");
    expect(zonedDateStr(instant, "UTC")).toBe("2026-09-09");
  });
});
