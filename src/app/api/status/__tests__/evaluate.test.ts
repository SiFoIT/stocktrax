import { describe, expect, it } from "vitest";
import {
  evaluateBackups,
  evaluateDataQuality,
  evaluateDigest,
  evaluateSnapshots,
  evaluateYahoo,
  lastExpectedTradingDay,
  worst,
} from "../evaluate";

// Fri Nov 13 2026 and Sat Nov 14 2026; EST is UTC-5.
const friAfterClose = new Date("2026-11-13T23:00:00Z"); // 18:00 ET Friday
const friMorning = new Date("2026-11-13T15:00:00Z"); // 10:00 ET Friday
const saturday = new Date("2026-11-14T15:00:00Z");

describe("lastExpectedTradingDay", () => {
  it("is today after 17:00 ET on a trading day", () => {
    expect(lastExpectedTradingDay(friAfterClose)).toBe("2026-11-13");
  });
  it("is the previous trading day before 17:00", () => {
    expect(lastExpectedTradingDay(friMorning)).toBe("2026-11-12");
  });
  it("walks back over the weekend", () => {
    expect(lastExpectedTradingDay(saturday)).toBe("2026-11-13");
  });
});

describe("evaluateDigest", () => {
  const base = {
    now: friAfterClose,
    timezone: "America/Toronto",
    smtpConfigured: true,
    dailyEnabled: true,
    weeklyEnabled: true,
    lastSentDaily: "2026-11-13",
    lastSentWeekly: "2026-11-07",
    recent: [],
  };

  it("is ok when the expected daily went out", () => {
    const s = evaluateDigest(base);
    expect(s.status).toBe("ok");
    expect(s.summary).toMatch(/^Last sent: daily Fri, Nov 13/);
  });

  it("is an error when the latest daily attempt failed, with the time and reason", () => {
    const s = evaluateDigest({
      ...base,
      lastSentDaily: "2026-11-12",
      recent: [
        { kind: "daily", status: "failed", subject: null, error: "Invalid login: 535 auth error", sentAt: "2026-11-13T22:01:00.000Z" },
        { kind: "daily", status: "sent", subject: "Daily", error: null, sentAt: "2026-11-12T22:01:00.000Z" },
      ],
    });
    expect(s.status).toBe("error");
    expect(s.summary).toBe("Daily digest failed Nov 13, 17:01: Invalid login: 535 auth error");
    expect(s.latestFailure?.sentAt).toBe("2026-11-13T22:01:00.000Z");
  });

  it("clears the error once a later attempt succeeds but keeps the failure visible", () => {
    const s = evaluateDigest({
      ...base,
      recent: [
        { kind: "daily", status: "sent", subject: "Daily", error: null, sentAt: "2026-11-13T22:05:00.000Z" },
        { kind: "daily", status: "failed", subject: null, error: "timeout", sentAt: "2026-11-13T22:01:00.000Z" },
      ],
    });
    expect(s.status).toBe("ok");
    expect(s.latestFailure?.error).toBe("timeout");
  });

  it("warns when email is not set up", () => {
    expect(evaluateDigest({ ...base, smtpConfigured: false }).status).toBe("warning");
  });

  it("warns when the expected daily has not gone out", () => {
    const s = evaluateDigest({ ...base, lastSentDaily: "2026-11-12" });
    expect(s.status).toBe("warning");
    expect(s.summary).toContain("Fri, Nov 13");
  });
});

describe("evaluateSnapshots", () => {
  it("flags today's snapshot as missing after the close", () => {
    const s = evaluateSnapshots({ now: friAfterClose, latestDate: "2026-11-12", rowCount: 10, portfolioCount: 2 });
    expect(s.todayExpected).toBe(true);
    expect(s.todayMissing).toBe(true);
    expect(s.status).toBe("warning");
  });

  it("is ok before the close when yesterday exists", () => {
    const s = evaluateSnapshots({ now: friMorning, latestDate: "2026-11-12", rowCount: 10, portfolioCount: 2 });
    expect(s.status).toBe("ok");
    expect(s.todayExpected).toBe(false);
  });

  it("is ok with no portfolios", () => {
    expect(evaluateSnapshots({ now: friAfterClose, latestDate: null, rowCount: 0, portfolioCount: 0 }).status).toBe("ok");
  });
});

describe("evaluateYahoo", () => {
  const stats = (calls: number, errors: number, since = "2026-11-01T00:00:00.000Z") => ({
    since,
    last24h: { calls, errors, byKind: { quote: { calls, errors } } },
    recentErrors: errors ? [{ at: "2026-11-13T22:00:00.000Z", kind: "quote", symbol: "AAPL", message: "429" }] : [],
  });

  it("grades by error rate", () => {
    expect(evaluateYahoo(stats(100, 1), friAfterClose, "UTC").status).toBe("ok");
    expect(evaluateYahoo(stats(100, 10), friAfterClose, "UTC").status).toBe("warning");
    expect(evaluateYahoo(stats(10, 8), friAfterClose, "UTC").status).toBe("error");
  });

  it("says when counting began less than a day ago", () => {
    const s = evaluateYahoo(stats(5, 0, "2026-11-13T20:00:00.000Z"), friAfterClose, "UTC");
    expect(s.summary).toContain("since the server started");
  });
});

describe("evaluateDataQuality", () => {
  it("warns about missing quotes and a stale rate", () => {
    const s = evaluateDataQuality({ symbols: ["XYZ"], exchangeRate: true }, { checked: true });
    expect(s.status).toBe("warning");
    expect(s.summary).toContain("XYZ");
    expect(s.notes[0]).toContain("USD/CAD");
  });
  it("is ok when nothing is missing", () => {
    expect(evaluateDataQuality(undefined, { checked: true }).status).toBe("ok");
  });
});

describe("evaluateBackups", () => {
  const base = { now: saturday, timezone: "UTC", enabled: true, keep: 8, intervalDays: 7, files: [], dir: "/d" };
  it("is an error after a failed run", () => {
    expect(evaluateBackups({ ...base, lastScheduled: { at: "2026-11-14T10:00:00Z", ok: false, error: "ENOSPC" } }).status).toBe("error");
  });
  it("warns when overdue or never run", () => {
    expect(evaluateBackups({ ...base, lastScheduled: null }).status).toBe("warning");
    expect(evaluateBackups({ ...base, lastScheduled: { at: "2026-11-01T10:00:00Z", ok: true } }).status).toBe("warning");
  });
  it("is ok after a recent success", () => {
    expect(evaluateBackups({ ...base, lastScheduled: { at: "2026-11-12T10:00:00Z", ok: true } }).status).toBe("ok");
  });
});

describe("worst", () => {
  it("picks the most severe", () => {
    expect(worst(["ok", "warning", "ok"])).toBe("warning");
    expect(worst(["warning", "error"])).toBe("error");
    expect(worst([])).toBe("ok");
  });
});
