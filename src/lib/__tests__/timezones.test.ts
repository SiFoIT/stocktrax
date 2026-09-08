import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEZONE,
  resolveTimezone,
  TIMEZONES,
  zoneOffsetMinutes,
} from "@/lib/timezones";

// The instant matters: half these zones shift twice a year, which is the whole
// reason the list holds IANA ids rather than fixed offsets.
const WINTER = new Date("2026-01-15T12:00:00Z");
const SUMMER = new Date("2026-07-15T12:00:00Z");

describe("zoneOffsetMinutes", () => {
  it("reads standard time", () => {
    expect(zoneOffsetMinutes("America/Toronto", WINTER)).toBe(-300);
    expect(zoneOffsetMinutes("UTC", WINTER)).toBe(0);
    expect(zoneOffsetMinutes("Asia/Kolkata", WINTER)).toBe(330);
    expect(zoneOffsetMinutes("America/St_Johns", WINTER)).toBe(-210);
  });

  it("follows daylight saving rather than a fixed offset", () => {
    expect(zoneOffsetMinutes("America/Toronto", SUMMER)).toBe(-240);
    // Arizona not shifting is the point of listing it separately.
    expect(zoneOffsetMinutes("America/Phoenix", WINTER)).toBe(-420);
    expect(zoneOffsetMinutes("America/Phoenix", SUMMER)).toBe(-420);
  });
});

describe("resolveTimezone", () => {
  it("keeps a zone that is already on the list", () => {
    expect(resolveTimezone("America/Vancouver", WINTER)).toBe("America/Vancouver");
  });

  it("maps an unlisted zone onto the entry sharing its clock", () => {
    expect(resolveTimezone("America/Chicago", WINTER)).toBe("America/Winnipeg");
    expect(resolveTimezone("America/Detroit", WINTER)).toBe("America/Toronto");
    expect(resolveTimezone("Europe/Madrid", WINTER)).toBe("Europe/Paris");
  });

  it("falls back rather than throwing on nonsense", () => {
    expect(resolveTimezone("Mars/Olympus_Mons", WINTER)).toBe(DEFAULT_TIMEZONE);
    expect(resolveTimezone("", WINTER)).toBe(DEFAULT_TIMEZONE);
  });

  it("offers every zone the resolver can return", () => {
    for (const zone of TIMEZONES) {
      expect(resolveTimezone(zone.id, WINTER)).toBe(zone.id);
    }
  });
});
