import type { DigestConfig } from "@/lib/settings";
import { isTradingDay } from "@/lib/markets/calendar";
import { weekdayOf } from "@/lib/digest/time";

/**
 * When the scheduler should act. Split out from the scheduler itself, and
 * importing `DigestConfig` as a type only, so the timing rules can be tested
 * against a fake clock without pulling in the database.
 */

const SATURDAY = 6;

export interface DueInput {
  /** `YYYY-MM-DD` in the configured timezone. */
  today: string;
  /** `HH:MM` in the configured timezone. */
  nowTime: string;
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
  const { today, nowTime, config, lastDaily, lastWeekly } = input;

  const tradingDay = isTradingDay(today);
  const pastDailyTime = nowTime >= config.dailyTime;

  // Snapshots are the weekly's baseline, so they are written even when the
  // daily email is switched off.
  const snapshot = tradingDay && pastDailyTime;

  const daily = config.dailyEnabled && snapshot && lastDaily !== today;

  const weekly =
    config.weeklyEnabled &&
    weekdayOf(today) === SATURDAY &&
    nowTime >= config.weeklyTime &&
    lastWeekly !== today;

  return { snapshot, daily, weekly };
}
