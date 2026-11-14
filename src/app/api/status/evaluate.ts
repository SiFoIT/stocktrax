import { isTradingDay, isTsxTradingDay } from "@/lib/markets/calendar";
import { addDays, MARKET_TIMEZONE, zonedDateStr, zonedTimeStr } from "@/lib/digest/time";
import type { BackupRunRecord, BackupFileInfo } from "@/lib/backup/files";
import type { YahooStats } from "@/lib/market-data/stats";
import type {
  BackupStatus,
  CacheStatus,
  DataQualityStatus,
  DigestLogRow,
  DigestStatus,
  SnapshotStatus,
  StatusLevel,
  YahooStatus,
} from "./types";

/**
 * Pure rules that turn raw facts into status sections. Kept apart from the
 * route so they can be tested without a database.
 */

const DAY_MS = 86_400_000;

/** The scheduler writes snapshots and sends the daily from 17:00 market time. */
export const DAILY_TIME = "17:00";
/** A little slack after 17:00 so the page does not flag a tick still in flight. */
const DAILY_GRACE_TIME = "17:15";

const LEVEL_RANK: Record<StatusLevel, number> = { ok: 0, warning: 1, error: 2 };

export function worst(levels: StatusLevel[]): StatusLevel {
  return levels.reduce<StatusLevel>((acc, l) => (LEVEL_RANK[l] > LEVEL_RANK[acc] ? l : acc), "ok");
}

function isMarketDay(dateStr: string): boolean {
  return isTradingDay(dateStr) || isTsxTradingDay(dateStr);
}

/**
 * The latest trading day (either exchange) whose 17:00 market-time mark has
 * passed by `now` — the day whose snapshot and daily digest should exist.
 */
export function lastExpectedTradingDay(now: Date, cutoff: string = DAILY_TIME): string | null {
  const today = zonedDateStr(now, MARKET_TIMEZONE);
  const time = zonedTimeStr(now, MARKET_TIMEZONE);
  let cursor = isMarketDay(today) && time >= cutoff ? today : addDays(today, -1);
  for (let i = 0; i < 14; i++) {
    if (isMarketDay(cursor)) return cursor;
    cursor = addDays(cursor, -1);
  }
  return null;
}

/** "Nov 13, 17:01" in `timeZone`. */
export function formatAt(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/** "Fri Nov 13" from `YYYY-MM-DD`. */
export function formatDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes || 0))} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function shortError(message: string | null | undefined): string {
  const text = (message ?? "unknown error").replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

const KIND_LABEL: Record<string, string> = { daily: "Daily", weekly: "Weekly", test: "Test" };

// --- Digest ---

export interface DigestInput {
  now: Date;
  timezone: string;
  smtpConfigured: boolean;
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  lastSentDaily: string | null;
  lastSentWeekly: string | null;
  /** Newest first. */
  recent: DigestLogRow[];
}

export function evaluateDigest(input: DigestInput): DigestStatus {
  const { now, timezone, smtpConfigured, dailyEnabled, weeklyEnabled, lastSentDaily, lastSentWeekly, recent } =
    input;
  const latestFailure = recent.find((r) => r.status === "failed") ?? null;
  const expectedDaily = dailyEnabled ? lastExpectedTradingDay(now, DAILY_GRACE_TIME) : null;

  const errors: string[] = [];
  const warnings: string[] = [];

  // A kind is in error while its most recent attempt is a failure; a later
  // success clears it, though the failure stays visible in the list.
  for (const kind of ["daily", "weekly"] as const) {
    const latest = recent.find((r) => r.kind === kind);
    if (latest?.status === "failed") {
      errors.push(`${KIND_LABEL[kind]} digest failed ${formatAt(latest.sentAt, timezone)}: ${shortError(latest.error)}`);
    }
  }

  if (!smtpConfigured && (dailyEnabled || weeklyEnabled)) {
    warnings.push("Email is not set up, so no digests are sent");
  } else if (smtpConfigured && expectedDaily && (!lastSentDaily || lastSentDaily < expectedDaily)) {
    warnings.push(`Daily digest for ${formatDay(expectedDaily)} has not gone out`);
  }

  const status: StatusLevel = errors.length ? "error" : warnings.length ? "warning" : "ok";
  const messages = [...errors, ...warnings];

  let summary: string;
  if (messages.length) {
    summary = messages[0];
  } else if (!dailyEnabled && !weeklyEnabled) {
    summary = "Both digests are switched off";
  } else {
    const parts: string[] = [];
    if (dailyEnabled) parts.push(`daily ${lastSentDaily ? formatDay(lastSentDaily) : "never"}`);
    if (weeklyEnabled) parts.push(`weekly ${lastSentWeekly ? formatDay(lastSentWeekly) : "never"}`);
    summary = `Last sent: ${parts.join(", ")}`;
  }

  return {
    status,
    summary,
    notes: messages.slice(1),
    smtpConfigured,
    dailyEnabled,
    weeklyEnabled,
    lastSentDaily,
    lastSentWeekly,
    expectedDaily,
    recent,
    latestFailure,
  };
}

// --- Snapshots ---

export interface SnapshotInput {
  now: Date;
  latestDate: string | null;
  rowCount: number;
  portfolioCount: number;
}

export function evaluateSnapshots(input: SnapshotInput): SnapshotStatus {
  const { now, latestDate, rowCount, portfolioCount } = input;
  const today = zonedDateStr(now, MARKET_TIMEZONE);
  const expectedDate = lastExpectedTradingDay(now, DAILY_GRACE_TIME);
  const todayExpected = expectedDate === today;
  const todayMissing = todayExpected && (!latestDate || latestDate < today);

  let status: StatusLevel = "ok";
  let summary: string;
  if (portfolioCount === 0) {
    summary = "No portfolios, so nothing to snapshot";
  } else if (expectedDate && (!latestDate || latestDate < expectedDate)) {
    status = "warning";
    summary = todayMissing
      ? `Today's snapshot (${formatDay(today)}) has not been written yet${
          latestDate ? `; latest is ${formatDay(latestDate)}` : ""
        }`
      : latestDate
        ? `Latest snapshot is ${formatDay(latestDate)}; expected ${formatDay(expectedDate)}`
        : "No snapshots have been written yet";
  } else if (latestDate) {
    summary = `Latest snapshot ${formatDay(latestDate)}`;
  } else {
    summary = "No snapshots yet; the first is written after 17:00 ET on a trading day";
  }

  return {
    status,
    summary,
    notes: [],
    latestDate,
    rowCount,
    portfolioCount,
    today,
    expectedDate,
    todayExpected,
    todayMissing,
  };
}

// --- Yahoo ---

export function evaluateYahoo(stats: YahooStats, now: Date, timezone: string): YahooStatus {
  const { calls, errors, byKind } = stats.last24h;
  const errorRate = calls > 0 ? errors / calls : 0;
  const sinceMs = Date.parse(stats.since);
  const partial = Number.isFinite(sinceMs) && now.getTime() - sinceMs < DAY_MS;
  const window = partial ? `since the server started ${formatAt(stats.since, timezone)}` : "in the last 24h";

  let status: StatusLevel = "ok";
  if (errors > 0 && calls >= 5 && errorRate >= 0.5) status = "error";
  else if (errors > 0 && errorRate >= 0.05) status = "warning";

  let summary: string;
  if (calls === 0) {
    summary = `No Yahoo calls ${window}`;
  } else {
    const pct = (errorRate * 100).toFixed(errorRate > 0 && errorRate < 0.01 ? 1 : 0);
    summary = `${calls} calls, ${errors} failed (${pct}%) ${window}`;
  }
  const notes: string[] = [];
  if (status !== "ok" && stats.recentErrors[0]) {
    const e = stats.recentErrors[0];
    notes.push(`Latest: ${e.kind}${e.symbol ? ` ${e.symbol}` : ""} at ${formatAt(e.at, timezone)}: ${shortError(e.message)}`);
  }
  notes.push("Counts are kept in memory and reset when the server restarts.");

  return {
    status,
    summary,
    notes,
    since: stats.since,
    calls,
    errors,
    errorRate,
    byKind,
    recentErrors: stats.recentErrors.slice(0, 10),
  };
}

// --- Data quality ---

export function evaluateDataQuality(
  missing: { symbols: string[]; exchangeRate: boolean } | undefined | null,
  options: { checked: boolean; error?: string }
): DataQualityStatus {
  if (!options.checked) {
    return { status: "ok", summary: "Not checked", notes: [], checked: false, missingSymbols: [], staleExchangeRate: false };
  }
  if (options.error) {
    return {
      status: "error",
      summary: `Portfolio summary failed: ${shortError(options.error)}`,
      notes: [],
      checked: true,
      missingSymbols: [],
      staleExchangeRate: false,
    };
  }
  const symbols = missing?.symbols ?? [];
  const exchangeRate = missing?.exchangeRate ?? false;
  const messages: string[] = [];
  if (symbols.length) {
    const shown = symbols.slice(0, 6).join(", ");
    messages.push(
      `No quote for ${shown}${symbols.length > 6 ? ` and ${symbols.length - 6} more` : ""}; excluded from totals`
    );
  }
  if (exchangeRate) messages.push("USD/CAD rate is the last known value, not live");
  return {
    status: messages.length ? "warning" : "ok",
    summary: messages[0] ?? "Every holding has a quote and the exchange rate is live",
    notes: messages.slice(1),
    checked: true,
    missingSymbols: symbols,
    staleExchangeRate: exchangeRate,
  };
}

// --- Cache ---

const CACHE_WARN_BYTES = 200 * 1024 * 1024;

export function evaluateCache(rows: number, bytes: number, staleRows: number): CacheStatus {
  const status: StatusLevel = bytes >= CACHE_WARN_BYTES ? "warning" : "ok";
  const summary = `${rows} entries, ${formatBytes(bytes)}${staleRows ? `; ${staleRows} older than 7 days` : ""}`;
  return {
    status,
    summary: status === "warning" ? `Cache is large: ${summary}` : summary,
    notes: [],
    rows,
    bytes,
    staleRows,
  };
}

// --- Backups ---

export interface BackupInput {
  now: Date;
  timezone: string;
  enabled: boolean;
  keep: number;
  intervalDays: number;
  lastScheduled: BackupRunRecord | null;
  files: BackupFileInfo[];
  dir: string;
}

export function evaluateBackups(input: BackupInput): BackupStatus {
  const { now, timezone, enabled, keep, intervalDays, lastScheduled, files, dir } = input;
  const newestFile = files[0] ?? null;
  const lastSuccessAt = lastScheduled?.ok ? lastScheduled.at : lastScheduled?.lastSuccessAt ?? null;

  let status: StatusLevel = "ok";
  let summary: string;
  if (lastScheduled && !lastScheduled.ok) {
    status = "error";
    summary = `Scheduled backup failed ${formatAt(lastScheduled.at, timezone)}: ${shortError(lastScheduled.error)}`;
  } else if (!enabled) {
    status = "warning";
    summary = "Scheduled backups are switched off";
  } else if (!lastSuccessAt) {
    status = "warning";
    summary = "No scheduled backup has run yet";
  } else if (now.getTime() - Date.parse(lastSuccessAt) > (intervalDays + 1) * DAY_MS) {
    status = "warning";
    summary = `Last scheduled backup ${formatAt(lastSuccessAt, timezone)} is overdue`;
  } else {
    summary = `Last scheduled backup ${formatAt(lastSuccessAt, timezone)}${
      lastScheduled?.size !== undefined ? ` (${formatBytes(lastScheduled.size)})` : ""
    }`;
  }

  const notes: string[] = [];
  if (newestFile) notes.push(`Newest file ${newestFile.name}, ${files.length} kept of ${keep}`);

  return {
    status,
    summary,
    notes,
    enabled,
    keep,
    intervalDays,
    lastScheduled,
    newestFile,
    fileCount: files.length,
    dir,
  };
}
