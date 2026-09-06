/**
 * NYSE trading calendar utilities with Eastern Time support.
 * Handles holidays, weekends, and pre-market hours.
 */

// --- Eastern Time helpers ---

interface DateComponents {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Sun, 6=Sat
}

const etFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short",
});

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function toEasternComponents(date: Date): DateComponents {
  const parts = etFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// --- Holiday computation ---

const holidayCache = new Map<number, Set<string>>();

/** Compute Easter Sunday using Meeus/Jones/Butcher algorithm */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Get nth occurrence of a weekday in a month (1-indexed) */
function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  n: number
): number {
  // First day of month
  const first = new Date(year, month - 1, 1).getDay();
  // Day of first occurrence of target weekday
  let day = 1 + ((weekday - first + 7) % 7);
  // Advance to nth occurrence
  day += (n - 1) * 7;
  return day;
}

/** Get last occurrence of a weekday in a month */
function lastWeekday(year: number, month: number, weekday: number): number {
  const lastDay = new Date(year, month, 0).getDate(); // last day of month
  const lastDow = new Date(year, month - 1, lastDay).getDay();
  const diff = (lastDow - weekday + 7) % 7;
  return lastDay - diff;
}

/** NYSE observed-holiday rules: Saturday → Friday, Sunday → Monday */
function observedDate(
  year: number,
  month: number,
  day: number
): { month: number; day: number } {
  const dow = new Date(year, month - 1, day).getDay();
  if (dow === 6) {
    // Saturday → previous Friday
    if (day === 1) {
      // Jan 1 on Saturday → Dec 31 previous year — handled by caller checking both years
      return { month, day: day - 1 }; // This won't happen for our holidays in practice
    }
    return { month, day: day - 1 };
  }
  if (dow === 0) {
    // Sunday → next Monday
    return { month, day: day + 1 };
  }
  return { month, day };
}

/** Get all NYSE market holidays for a given year as "YYYY-MM-DD" strings */
export function getMarketHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const holidays = new Set<string>();
  const add = (m: number, d: number) => holidays.add(toDateStr(year, m, d));

  // New Year's Day — Jan 1 (observed). NYSE does NOT observe when Jan 1 falls
  // on a Saturday (no prior-Friday holiday), so only add otherwise.
  if (new Date(year, 0, 1).getDay() !== 6) {
    const ny = observedDate(year, 1, 1);
    add(ny.month, ny.day);
  }

  // MLK Day — 3rd Monday of January
  add(1, nthWeekday(year, 1, 1, 3));

  // Presidents' Day — 3rd Monday of February
  add(2, nthWeekday(year, 2, 1, 3));

  // Good Friday — Friday before Easter
  const easter = easterSunday(year);
  // Easter is always a Sunday, Good Friday is 2 days before
  const gfDate = new Date(year, easter.month - 1, easter.day - 2);
  add(gfDate.getMonth() + 1, gfDate.getDate());

  // Memorial Day — Last Monday of May
  add(5, lastWeekday(year, 5, 1));

  // Juneteenth — June 19 (observed)
  const jt = observedDate(year, 6, 19);
  add(jt.month, jt.day);

  // Independence Day — July 4 (observed)
  const id = observedDate(year, 7, 4);
  add(id.month, id.day);

  // Labor Day — 1st Monday of September
  add(9, nthWeekday(year, 9, 1, 1));

  // Thanksgiving — 4th Thursday of November
  add(11, nthWeekday(year, 11, 4, 4));

  // Christmas — December 25 (observed)
  const xmas = observedDate(year, 12, 25);
  add(xmas.month, xmas.day);

  holidayCache.set(year, holidays);
  return holidays;
}

// --- Early-close (half-day) computation ---

const earlyCloseCache = new Map<number, Set<string>>();

/**
 * NYSE early-close (1:00 PM ET) half-days for a given year:
 * the day after Thanksgiving, Christmas Eve, and July 3 — each only when it is
 * a weekday trading day and not itself an observed holiday.
 */
function getEarlyCloseDays(year: number): Set<string> {
  const cached = earlyCloseCache.get(year);
  if (cached) return cached;

  const days = new Set<string>();
  const holidays = getMarketHolidays(year);
  const addIfTradingWeekday = (m: number, d: number) => {
    const dateStr = toDateStr(year, m, d);
    const dow = new Date(year, m - 1, d).getDay();
    if (dow >= 1 && dow <= 5 && !holidays.has(dateStr)) days.add(dateStr);
  };

  // Day after Thanksgiving (Friday following the 4th Thursday of November)
  addIfTradingWeekday(11, nthWeekday(year, 11, 4, 4) + 1);

  // Christmas Eve — early close only Mon–Thu (a Friday Dec 24 is the observed holiday)
  const dec24dow = new Date(year, 11, 24).getDay();
  if (dec24dow >= 1 && dec24dow <= 4) addIfTradingWeekday(12, 24);

  // July 3 — early close only Mon–Thu (i.e. July 4 falls Tue–Fri)
  const jul3dow = new Date(year, 6, 3).getDay();
  if (jul3dow >= 1 && jul3dow <= 4) addIfTradingWeekday(7, 3);

  earlyCloseCache.set(year, days);
  return days;
}

// --- Trading day logic ---

function isTradingDay(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  // Weekend
  if (dow === 0 || dow === 6) return false;
  // Holiday
  if (getMarketHolidays(y).has(dateStr)) return false;
  return true;
}

function prevCalendarDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const prev = new Date(y, m - 1, d - 1);
  return toDateStr(
    prev.getFullYear(),
    prev.getMonth() + 1,
    prev.getDate()
  );
}

/**
 * Resolve a Date to its "trading date" string in ET.
 * A trading day starts at 9:30 AM ET; before that maps to the previous trading day.
 * Weekends and holidays walk back to the last real trading day.
 */
function getTradingDate(date: Date): string {
  const et = toEasternComponents(date);
  let dateStr = toDateStr(et.year, et.month, et.day);

  // Before 9:30 AM ET → previous calendar day
  const timeMinutes = et.hour * 60 + et.minute;
  if (timeMinutes < 9 * 60 + 30) {
    dateStr = prevCalendarDay(dateStr);
  }

  // Walk back through weekends and holidays
  while (!isTradingDay(dateStr)) {
    dateStr = prevCalendarDay(dateStr);
  }

  return dateStr;
}

// --- Public API ---

/**
 * Check if two dates fall within the same NYSE trading day.
 * Converts to ET, resolves to trading date (accounting for pre-market, weekends, holidays).
 */
export function isSameTradingDay(a: Date, b: Date): boolean {
  return getTradingDate(a) === getTradingDate(b);
}

/**
 * Check if NYSE market is currently open.
 * Accounts for Eastern Time, weekends, and holidays.
 */
export function isMarketOpen(date?: Date): boolean {
  const d = date ?? new Date();
  const et = toEasternComponents(d);

  // Weekend
  if (et.weekday === 0 || et.weekday === 6) return false;

  // Holiday
  const dateStr = toDateStr(et.year, et.month, et.day);
  if (getMarketHolidays(et.year).has(dateStr)) return false;

  // 9:30 AM – 4:00 PM ET (1:00 PM ET on early-close half-days)
  const timeMinutes = et.hour * 60 + et.minute;
  const closeMinutes = getEarlyCloseDays(et.year).has(dateStr) ? 13 * 60 : 16 * 60;
  return timeMinutes >= 9 * 60 + 30 && timeMinutes < closeMinutes;
}

function nextCalendarDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  return toDateStr(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

/**
 * Build a Date for a wall-clock time in Eastern Time.
 * Uses the offset approach: treat the wall clock as UTC, measure how far that
 * instant's ET rendering drifts, then correct by that amount. The probe instant
 * is only a few hours from the target and market times are never adjacent to a
 * Sunday 2 AM DST switch, so the offset is always the right one.
 */
function easternWallClock(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const et = toEasternComponents(new Date(guess));
  const etAsUtc = Date.UTC(et.year, et.month - 1, et.day, et.hour, et.minute);
  return new Date(guess + (guess - etAsUtc));
}

/**
 * The next time the NYSE opens or closes.
 * `open` reports the state *now*, so `at` is the upcoming close when the market
 * is open and the upcoming open when it is closed. Accounts for weekends,
 * holidays and 1:00 PM ET early-close half-days.
 */
export function getNextMarketTransition(date?: Date): { open: boolean; at: Date } {
  const d = date ?? new Date();
  const et = toEasternComponents(d);

  if (isMarketOpen(d)) {
    const dateStr = toDateStr(et.year, et.month, et.day);
    const closeHour = getEarlyCloseDays(et.year).has(dateStr) ? 13 : 16;
    return { open: true, at: easternWallClock(et.year, et.month, et.day, closeHour, 0) };
  }

  let dateStr = toDateStr(et.year, et.month, et.day);
  const timeMinutes = et.hour * 60 + et.minute;
  const opensLaterToday = isTradingDay(dateStr) && timeMinutes < 9 * 60 + 30;

  if (!opensLaterToday) {
    dateStr = nextCalendarDay(dateStr);
    let guard = 0;
    while (!isTradingDay(dateStr) && guard++ < 10) {
      dateStr = nextCalendarDay(dateStr);
    }
  }

  const [y, m, day] = dateStr.split("-").map(Number);
  return { open: false, at: easternWallClock(y, m, day, 9, 30) };
}
