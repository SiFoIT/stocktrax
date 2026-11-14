import { getSetting, setSetting } from "@/lib/settings";
import { backupFilename, buildBackup } from "@/lib/backup/build";
import {
  backupsDir,
  isBackupDue,
  pruneBackups,
  writeBackupFile,
  type BackupRunRecord,
} from "@/lib/backup/files";

/**
 * Scheduled backups into `<data dir>/backups/`, called from the digest
 * scheduler's one-minute tick. The check is two settings reads; nothing is
 * built or written unless a backup is due.
 */

export const BACKUP_SETTING_KEYS = {
  enabled: "backup.scheduled.enabled",
  keep: "backup.scheduled.keep",
  intervalDays: "backup.scheduled.intervalDays",
  lastScheduled: "backup.lastScheduled",
  lastManual: "backup.lastManual",
} as const;

export const BACKUP_DEFAULTS = {
  enabled: true,
  keep: 8,
  intervalDays: 7,
} as const;

export interface BackupConfig {
  enabled: boolean;
  keep: number;
  intervalDays: number;
}

export async function getBackupConfig(): Promise<BackupConfig> {
  const [enabled, keep, intervalDays] = await Promise.all([
    getSetting<boolean>(BACKUP_SETTING_KEYS.enabled, BACKUP_DEFAULTS.enabled),
    getSetting<number>(BACKUP_SETTING_KEYS.keep, BACKUP_DEFAULTS.keep),
    getSetting<number>(BACKUP_SETTING_KEYS.intervalDays, BACKUP_DEFAULTS.intervalDays),
  ]);
  return {
    enabled: enabled !== false,
    keep: Number.isFinite(keep) && keep >= 1 ? Math.floor(keep) : BACKUP_DEFAULTS.keep,
    intervalDays:
      Number.isFinite(intervalDays) && intervalDays >= 1 ? intervalDays : BACKUP_DEFAULTS.intervalDays,
  };
}

export async function getLastBackupRecord(
  kind: "scheduled" | "manual"
): Promise<BackupRunRecord | null> {
  const key = kind === "scheduled" ? BACKUP_SETTING_KEYS.lastScheduled : BACKUP_SETTING_KEYS.lastManual;
  const record = await getSetting<BackupRunRecord | null>(key, null);
  return record && typeof record === "object" && typeof record.at === "string" ? record : null;
}

// Serialises runs: a manual POST must not race a scheduled tick on the same file.
const state = ((globalThis as { __stocktraxBackup?: { running: boolean } }).__stocktraxBackup ??= {
  running: false,
});

export interface BackupRunResult {
  ran: boolean;
  path?: string;
  filename?: string;
  size?: number;
  removed?: string[];
  error?: string;
}

/**
 * Build, write and prune. Records the outcome under `backup.lastScheduled` or
 * `backup.lastManual`. Never throws.
 */
export async function runBackup(
  kind: "scheduled" | "manual",
  now: Date = new Date()
): Promise<BackupRunResult> {
  if (state.running) return { ran: false, error: "A backup is already running" };
  state.running = true;

  const key = kind === "scheduled" ? BACKUP_SETTING_KEYS.lastScheduled : BACKUP_SETTING_KEYS.lastManual;
  let previous: BackupRunRecord | null = null;
  try {
    previous = await getLastBackupRecord(kind);
    const config = await getBackupConfig();
    const backup = await buildBackup({ now });
    const dir = backupsDir();
    const filename = backupFilename(now);
    const { path, size } = writeBackupFile(dir, filename, JSON.stringify(backup, null, 2));
    const removed = pruneBackups(dir, config.keep);

    const record: BackupRunRecord = {
      at: now.toISOString(),
      ok: true,
      path,
      filename,
      size,
      lastSuccessAt: now.toISOString(),
    };
    await setSetting(key, record);
    return { ran: true, path, filename, size, removed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[backup] ${kind} backup failed:`, error);
    try {
      const record: BackupRunRecord = {
        at: now.toISOString(),
        ok: false,
        error: message,
        lastSuccessAt: previous?.ok ? previous.at : previous?.lastSuccessAt ?? null,
      };
      await setSetting(key, record);
    } catch {
      // The database itself is the problem; nothing more to record.
    }
    return { ran: true, error: message };
  } finally {
    state.running = false;
  }
}

/**
 * Called every minute by the scheduler. Writes a backup only when one is due
 * (weekly by default, or none has ever succeeded). Never throws.
 */
export async function maybeRunScheduledBackup(
  now: Date
): Promise<{ ran: boolean; path?: string; error?: string }> {
  try {
    const config = await getBackupConfig();
    if (!config.enabled) return { ran: false };
    const last = await getLastBackupRecord("scheduled");
    if (!isBackupDue(last, now, config.intervalDays)) return { ran: false };
    const result = await runBackup("scheduled", now);
    return { ran: result.ran, path: result.path, error: result.error };
  } catch (error) {
    return { ran: false, error: error instanceof Error ? error.message : String(error) };
  }
}
