/**
 * Back-off for the scheduler's daily jobs (snapshot, daily and weekly send).
 *
 * The scheduler ticks every minute and a job stays due until midnight, so
 * without this a wrong SMTP password meant ~420 login attempts a night and a
 * persistently missing quote meant rebuilding the summary every minute. A
 * failed job now waits 15, 30, 60, then 120 minutes, and gives up for the day
 * after five attempts. Pure, so it is tested without a clock or a database.
 */

export interface RetryState {
  attempts: number;
  nextAt: number;
}

const DELAYS_MIN = [15, 30, 60, 120];
export const MAX_ATTEMPTS = 5;

export function canAttempt(state: RetryState | undefined, now: number): boolean {
  if (!state) return true;
  return state.attempts < MAX_ATTEMPTS && now >= state.nextAt;
}

export function afterFailure(state: RetryState | undefined, now: number): RetryState {
  const attempts = (state?.attempts ?? 0) + 1;
  const delay = DELAYS_MIN[Math.min(attempts - 1, DELAYS_MIN.length - 1)];
  return { attempts, nextAt: now + delay * 60_000 };
}
