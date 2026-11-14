import {
  getDigestConfig,
  getSetting,
  getSmtpConfig,
  isSmtpConfigured,
  setSetting,
} from "@/lib/settings";
import { digestWeek, MARKET_TIMEZONE, zonedDateStr, zonedTimeStr } from "@/lib/digest/time";
import { decideDue, type DueDecision } from "@/lib/digest/due";
import { snapshotsExist, writeSnapshots } from "@/lib/digest/snapshots";
import { sendDigest } from "@/lib/digest/send";
import { afterFailure, canAttempt, type RetryState } from "@/lib/digest/retry";
import { pruneCache } from "@/lib/market-data/cache";
import { maybeRunScheduledBackup } from "@/lib/backup/scheduled";

/**
 * In-process digest scheduler.
 *
 * One interval, started from `src/instrumentation.ts` when the server boots.
 * No sidecar and no extra container: the trade-off is that the app must be
 * running at the scheduled time, which the catch-up rule below softens.
 */

const TICK_MS = 60_000;

export { decideDue } from "@/lib/digest/due";
export type { DueDecision, DueInput } from "@/lib/digest/due";

/**
 * Scheduler state lives on globalThis rather than in module variables: a
 * dev-server hot reload re-evaluates this module with fresh variables, which
 * would let a second interval (with its own `running` flag) start alongside
 * the first and send the same digest twice.
 */
interface SchedulerState {
  timer: ReturnType<typeof setInterval> | null;
  running: boolean;
  /** Back-off per job and market date, e.g. "daily:2026-11-13". */
  retries: Map<string, RetryState>;
  /** Market date the cache was last pruned. */
  prunedOn: string | null;
}

const state: SchedulerState = ((globalThis as { __stocktraxDigest?: SchedulerState }).__stocktraxDigest ??= {
  timer: null,
  running: false,
  retries: new Map(),
  prunedOn: null,
});
// A state object created before these fields existed (dev hot reload).
state.retries ??= new Map();
state.prunedOn ??= null;

/** Cache rows untouched this long are leftovers. */
const CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Run `job` for `key` unless it is backing off; record a failure (a false
 * result or a throw) so the next attempt waits. Keys carry the date, so each
 * day starts clean.
 */
async function attempt(key: string, nowMs: number, job: () => Promise<boolean>): Promise<void> {
  if (!canAttempt(state.retries.get(key), nowMs)) return;
  let ok = false;
  try {
    ok = await job();
  } catch (error) {
    console.error(`[digest] ${key} failed:`, error);
  }
  if (ok) {
    state.retries.delete(key);
  } else {
    const next = afterFailure(state.retries.get(key), nowMs);
    state.retries.set(key, next);
    console.warn(`[digest] ${key} failed (attempt ${next.attempts}); next try ${new Date(next.nextAt).toISOString()}`);
  }
}

export async function runTick(now = new Date()): Promise<DueDecision | null> {
  // Ticks are serialised: a slow Yahoo call must not overlap the next minute.
  if (state.running) return null;
  state.running = true;

  try {
    const config = await getDigestConfig();
    const [lastDaily, lastWeekly] = await Promise.all([
      getSetting<string | null>("digest.lastSent.daily", null),
      getSetting<string | null>("digest.lastSent.weekly", null),
    ]);

    const today = zonedDateStr(now, MARKET_TIMEZONE);
    const nowTime = zonedTimeStr(now, MARKET_TIMEZONE);
    const localToday = zonedDateStr(now, config.timezone);
    const localTime = zonedTimeStr(now, config.timezone);
    const decision = decideDue({
      today,
      nowTime,
      localToday,
      localTime,
      config,
      lastDaily,
      lastWeekly,
    });

    const nowMs = now.getTime();
    // Drop the retry bookkeeping of earlier days.
    for (const key of state.retries.keys()) if (!key.endsWith(today)) state.retries.delete(key);

    if (state.prunedOn !== today) {
      state.prunedOn = today;
      const pruned = await pruneCache(CACHE_MAX_AGE_MS);
      if (pruned > 0) console.log(`[digest] pruned ${pruned} stale cache rows`);
    }

    if (decision.snapshot) {
      // writeSnapshots is true once today's rows exist (or were already
      // there), false when prices were incomplete; the latter backs off.
      await attempt(`snapshot:${today}`, nowMs, async () => {
        await writeSnapshots(today);
        return snapshotsExist(today);
      });
    }

    // Weekly backup into data/backups. Before the SMTP check: backups must
    // run on installs without email. Cheap when not due; never throws.
    await maybeRunScheduledBackup(now);

    // Both digests default to on, so an install that never configured email
    // would otherwise log a failed send every trading day. Snapshots above
    // still accumulate, ready for whenever email is set up.
    if (!isSmtpConfigured(await getSmtpConfig())) {
      return decision;
    }

    if (decision.daily) {
      // A failure leaves the marker alone, so a later attempt (after the
      // back-off) can still send today.
      await attempt(`daily:${today}`, nowMs, async () => {
        const result = await sendDigest("daily", { now });
        if (result.status === "failed") return false;
        await setSetting("digest.lastSent.daily", today);
        return true;
      });
    }

    if (decision.weekly) {
      await attempt(`weekly:${today}`, nowMs, async () => {
        // Keep the value history going for Friday even if the daily never ran.
        await writeSnapshots(digestWeek(today).end);
        const result = await sendDigest("weekly", { now });
        if (result.status === "failed") return false;
        await setSetting("digest.lastSent.weekly", today);
        return true;
      });
    }

    return decision;
  } catch (error) {
    console.error("[digest] tick failed:", error);
    return null;
  } finally {
    state.running = false;
  }
}

export function startScheduler(): void {
  // Dev-server hot reloads re-run module init; without this guard each reload
  // would leave another interval behind.
  if (state.timer) return;
  state.timer = setInterval(() => {
    void runTick();
  }, TICK_MS);
  // Never hold the process open on this timer alone.
  state.timer.unref?.();
  console.log("[digest] scheduler started");
}

export function stopScheduler(): void {
  if (!state.timer) return;
  clearInterval(state.timer);
  state.timer = null;
}
