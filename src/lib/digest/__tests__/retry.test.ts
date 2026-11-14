import { describe, expect, it } from "vitest";
import { afterFailure, canAttempt, MAX_ATTEMPTS } from "../retry";

const MIN = 60_000;

describe("scheduler retry back-off", () => {
  it("runs a job that hasn't failed", () => {
    expect(canAttempt(undefined, 0)).toBe(true);
  });

  it("waits 15, 30, 60, then 120 minutes between attempts", () => {
    let s = afterFailure(undefined, 0);
    expect(s.nextAt).toBe(15 * MIN);
    expect(canAttempt(s, 14 * MIN)).toBe(false);
    expect(canAttempt(s, 15 * MIN)).toBe(true);
    s = afterFailure(s, 15 * MIN);
    expect(s.nextAt).toBe(45 * MIN);
    s = afterFailure(s, 45 * MIN);
    expect(s.nextAt).toBe(105 * MIN);
    s = afterFailure(s, 105 * MIN);
    expect(s.nextAt).toBe(225 * MIN);
  });

  it("gives up for the day after the last attempt", () => {
    let s = undefined;
    for (let i = 0; i < MAX_ATTEMPTS; i++) s = afterFailure(s, 0);
    expect(canAttempt(s, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});
