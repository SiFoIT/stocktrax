import { describe, it, expect } from "vitest";
import { toEasternTime } from "@/lib/utils";
import { formatEtShiftedTime, sessionWindowStart } from "../chart-time";

const et = (iso: string) => toEasternTime(Math.floor(new Date(iso).getTime() / 1000));

describe("formatEtShiftedTime", () => {
  it("shows New York wall-clock time in any browser zone", () => {
    // 20:55Z on Nov 13 2026 is 3:55 PM EST.
    expect(formatEtShiftedTime(et("2026-11-13T20:55:00Z"))).toBe("Nov 13, 3:55 PM");
    expect(formatEtShiftedTime(et("2026-07-01T13:30:00Z"))).toBe("Jul 1, 9:30 AM");
  });
});

describe("sessionWindowStart", () => {
  // Bars at the open and close of each listed trading day (ET-shifted).
  const bars = (days: string[]) =>
    days.flatMap((d) => [et(`${d}T14:30:00Z`), et(`${d}T20:55:00Z`)]);

  it("covers five sessions across a weekend", () => {
    // Thu, Fri, Mon, Tue, Wed, Thu: five sessions back from Thursday starts Friday.
    const times = bars(["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(sessionWindowStart(times, 5)).toBe(et("2026-11-06T14:30:00Z"));
  });

  it("returns the last session's first bar for one session", () => {
    const times = bars(["2026-11-11", "2026-11-12"]);
    expect(sessionWindowStart(times, 1)).toBe(et("2026-11-12T14:30:00Z"));
  });

  it("returns the first bar when there are fewer sessions than asked", () => {
    const times = bars(["2026-11-11", "2026-11-12"]);
    expect(sessionWindowStart(times, 5)).toBe(times[0]);
    expect(sessionWindowStart([], 5)).toBeUndefined();
  });
});
