/**
 * The timezone choices offered in settings.
 *
 * A short curated list, not the ~400-entry IANA database: the only thing the
 * setting still controls is what time the weekly email lands, and nobody needs
 * Pacific/Chatham to answer that. North America first, because the app tracks
 * TSX and US symbols and reports in CAD.
 *
 * These are IANA zone ids rather than fixed UTC offsets on purpose. An offset
 * carries no daylight-saving rules, so a "UTC−5" reader would drift an hour
 * every spring and get the weekly at 07:00 or 09:00 for half the year.
 */

export interface TimezoneOption {
  id: string;
  label: string;
}

export interface TimezoneGroup {
  label: string;
  zones: TimezoneOption[];
}

export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    label: "North America",
    zones: [
      { id: "America/St_Johns", label: "Newfoundland — St. John's" },
      { id: "America/Halifax", label: "Atlantic — Halifax" },
      { id: "America/Toronto", label: "Eastern — Toronto, New York" },
      { id: "America/Winnipeg", label: "Central — Winnipeg, Chicago" },
      { id: "America/Edmonton", label: "Mountain — Edmonton, Denver" },
      { id: "America/Phoenix", label: "Arizona — Phoenix (no DST)" },
      { id: "America/Vancouver", label: "Pacific — Vancouver, Los Angeles" },
    ],
  },
  {
    label: "Rest of world",
    zones: [
      { id: "UTC", label: "UTC" },
      { id: "Europe/London", label: "United Kingdom — London" },
      { id: "Europe/Paris", label: "Central Europe — Paris, Berlin" },
      { id: "Europe/Athens", label: "Eastern Europe — Athens, Helsinki" },
      { id: "Asia/Dubai", label: "Gulf — Dubai" },
      { id: "Asia/Kolkata", label: "India — Kolkata" },
      { id: "Asia/Singapore", label: "Singapore, Hong Kong" },
      { id: "Asia/Tokyo", label: "Japan — Tokyo" },
      { id: "Australia/Sydney", label: "Australia — Sydney" },
      { id: "Pacific/Auckland", label: "New Zealand — Auckland" },
    ],
  },
];

export const TIMEZONES: TimezoneOption[] = TIMEZONE_GROUPS.flatMap((g) => g.zones);

export const DEFAULT_TIMEZONE = "America/Toronto";

/** Minutes `timeZone` is ahead of UTC at `at`, daylight saving included. */
export function zoneOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  // Read the zone's wall clock back as if it were UTC; the gap is the offset.
  // Some engines render midnight as hour 24.
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );

  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * The listed zone to preselect for a browser-reported zone.
 *
 * Browsers report the reader's actual zone — `America/Winnipeg`, say — which a
 * curated list will usually not contain. Falling back to the default would put
 * a Winnipeg reader on Eastern, so match on the current UTC offset instead and
 * land them on Central, which keeps the same wall clock.
 */
export function resolveTimezone(detected: string, at: Date = new Date()): string {
  if (!detected) return DEFAULT_TIMEZONE;
  if (TIMEZONES.some((zone) => zone.id === detected)) return detected;

  try {
    const target = zoneOffsetMinutes(detected, at);
    const match = TIMEZONES.find((zone) => zoneOffsetMinutes(zone.id, at) === target);
    return match?.id ?? DEFAULT_TIMEZONE;
  } catch {
    // An id Intl does not recognise.
    return DEFAULT_TIMEZONE;
  }
}
