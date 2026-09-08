import {
  getDigestConfig,
  getSetting,
  getSmtpConfig,
  isSmtpConfigured,
  setSetting,
} from "@/lib/settings";
import { digestWeek, MARKET_TIMEZONE, zonedDateStr, zonedTimeStr } from "@/lib/digest/time";
import { decideDue, type DueDecision } from "@/lib/digest/due";
import { writeSnapshots } from "@/lib/digest/snapshots";
import { sendDigest } from "@/lib/digest/send";

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

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export async function runTick(now = new Date()): Promise<DueDecision | null> {
  // Ticks are serialised: a slow Yahoo call must not overlap the next minute.
  if (running) return null;
  running = true;

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

    if (decision.snapshot) {
      await writeSnapshots(today);
    }

    // Both digests default to on, so an install that never configured email
    // would otherwise log a failed send every trading day. Snapshots above
    // still accumulate, ready for whenever email is set up.
    if (!isSmtpConfigured(await getSmtpConfig())) {
      return decision;
    }

    if (decision.daily) {
      const result = await sendDigest("daily", { now });
      // A failure leaves the marker alone so the next tick retries today.
      if (result.status !== "failed") {
        await setSetting("digest.lastSent.daily", today);
      }
    }

    if (decision.weekly) {
      // The weekly compares against Friday's close, so make sure it exists
      // even if the daily never ran.
      await writeSnapshots(digestWeek(today).end);
      const result = await sendDigest("weekly", { now });
      if (result.status !== "failed") {
        await setSetting("digest.lastSent.weekly", today);
      }
    }

    return decision;
  } catch (error) {
    console.error("[digest] tick failed:", error);
    return null;
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  // Dev-server hot reloads re-run module init; without this guard each reload
  // would leave another interval behind.
  if (timer) return;
  timer = setInterval(() => {
    void runTick();
  }, TICK_MS);
  // Never hold the process open on this timer alone.
  timer.unref?.();
  console.log("[digest] scheduler started");
}

export function stopScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
