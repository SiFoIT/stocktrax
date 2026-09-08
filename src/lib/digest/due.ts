import type { DigestConfig } from "@/lib/settings";
import { isTradingDay } from "@/lib/markets/calendar";
import { weekdayOf } from "@/lib/digest/time";

/**
 * When the scheduler should act. Split out from the scheduler itself, and
 * importing `DigestConfig` as a type only, so the timing rules can be tested
 * against a fake clock without pulling in the database.
 *
 * Dates and the daily's hour are market time: the digest reports a trading
 * session, so which day it is and whether the market has closed are facts
 * about New York, not about the reader. The reader's zone is consulted for one
 * thing only — what time on Saturday the weekly should land.
 */

const SATURDAY = 6;

/**
 * The send times are fixed, not settings.
 *
 * The daily is an end-of-day summary, so the only defensible time is one after
 * the 16:00 close; the weekly reports a week that is already over. Nobody
 * needs a lunchtime portfolio email badly enough to pay for the failure it
 * invites — an earlier daily would report intraday figures under a "Closing
 * prices" footer, and would bank the snapshot that the weekly measures from at
 * whatever the value happened to be mid-session.
 */
const DAILY_TIME = "17:00";
const WEEKLY_TIME = "08:00";

export interface DueInput {
  /** `YYYY-MM-DD` in market time — the trading day being reported on. */
  today: string;
  /** `HH:MM` in market time. */
  nowTime: string;
  /** `YYYY-MM-DD` in the reader's timezone. */
  localToday: string;
  /** `HH:MM` in the reader's timezone. */
  localTime: string;
  config: DigestConfig;
  lastDaily: string | null;
  lastWeekly: string | null;
}

export interface DueDecision {
  /** Record today's portfolio values, whether or not an email goes out. */
  snapshot: boolean;
  daily: boolean;
  weekly: boolean;
}

/**
 * What this tick should do. Pure, so the timing rules can be tested against a
 * fake clock rather than waited out.
 *
 * A send missed while the container was down goes out on the next tick that
 * same day, because the time comparison stays true until midnight. After
 * midnight `nowTime` resets below the scheduled time and the day is skipped
 * rather than sent late.
 */
export function decideDue(input: DueInput): DueDecision {
  const { today, nowTime, localToday, localTime, config, lastDaily, lastWeekly } = input;

  const tradingDay = isTradingDay(today);
  const pastDailyTime = nowTime >= DAILY_TIME;

  // Snapshots are the weekly's baseline, so they are written even when the
  // daily email is switched off.
  const snapshot = tradingDay && pastDailyTime;

  const daily = config.dailyEnabled && snapshot && lastDaily !== today;

  // Two clocks, because the weekly answers to both.
  //
  // The market's Saturday is what guarantees the week is actually over: a
  // reader far enough east reaches their own Saturday breakfast while New York
  // is still trading on Friday. The reader's Saturday is what makes it a
  // weekend email: the market's Saturday begins on Friday evening out west, and
  // an hour check alone would pass at 21:00 Friday. Both, then the hour.
  const weekly =
    config.weeklyEnabled &&
    weekdayOf(today) === SATURDAY &&
    weekdayOf(localToday) === SATURDAY &&
    localTime >= WEEKLY_TIME &&
    lastWeekly !== today;

  return { snapshot, daily, weekly };
}
