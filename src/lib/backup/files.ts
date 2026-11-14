import { mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Backup files on disk: naming, listing, retention and the due check. Free of
 * the database so it can be tested against a temp directory.
 */

/** The exact shape of a backup file name. Anything else is never touched. */
export const BACKUP_FILE_PATTERN = /^stocktrax-backup-\d{4}-\d{2}-\d{2}\.json$/;

export function isBackupFilename(name: string): boolean {
  return BACKUP_FILE_PATTERN.test(name);
}

/**
 * Where the database lives — resolved the same way as `src/lib/db/index.ts`,
 * so in Docker this is the mounted `/app/data` volume.
 */
export function dataDir(): string {
  return join(process.cwd(), "data");
}

export function backupsDir(base: string = dataDir()): string {
  return join(base, "backups");
}

export interface BackupFileInfo {
  name: string;
  size: number;
  /** `YYYY-MM-DD` from the file name. */
  date: string;
  modifiedAt: string;
}

/** Backup files in `dir`, newest first. A missing directory is an empty list. */
export function listBackupFiles(dir: string): BackupFileInfo[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const files: BackupFileInfo[] = [];
  for (const name of names) {
    if (!isBackupFilename(name)) continue;
    try {
      const stat = statSync(join(dir, name));
      if (!stat.isFile()) continue;
      files.push({
        name,
        size: stat.size,
        date: name.slice("stocktrax-backup-".length, -".json".length),
        modifiedAt: stat.mtime.toISOString(),
      });
    } catch {
      // Vanished between readdir and stat: skip it.
    }
  }
  return files.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

/**
 * Which backup files to delete so that the newest `keep` remain. Names that do
 * not match the backup pattern are never selected. The date in the name sorts
 * lexically, so newest is simply the greatest name.
 */
export function selectForDeletion(names: string[], keep: number): string[] {
  const keepCount = Math.max(1, Math.floor(Number.isFinite(keep) ? keep : 1));
  const sorted = names.filter(isBackupFilename).sort().reverse();
  return sorted.slice(keepCount);
}

/** Delete all but the newest `keep` backup files in `dir`; returns what was removed. */
export function pruneBackups(dir: string, keep: number): string[] {
  const doomed = selectForDeletion(
    listBackupFiles(dir).map((f) => f.name),
    keep
  );
  const removed: string[] = [];
  for (const name of doomed) {
    try {
      unlinkSync(join(dir, name));
      removed.push(name);
    } catch {
      // Leave it for the next run.
    }
  }
  return removed;
}

/**
 * Write `content` to `dir/filename` via a temp file and rename, so a crash
 * mid-write never leaves a truncated file that looks like a valid backup.
 * The temp name deliberately does not match the backup pattern.
 */
export function writeBackupFile(dir: string, filename: string, content: string): { path: string; size: number } {
  if (!isBackupFilename(filename)) {
    throw new Error(`Invalid backup filename: ${filename}`);
  }
  mkdirSync(dir, { recursive: true });
  const finalPath = join(dir, filename);
  const tmpPath = join(dir, `.${filename}.${process.pid}.tmp`);
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, finalPath);
  return { path: finalPath, size: statSync(finalPath).size };
}

const DAY_MS = 86_400_000;
/** After a failure, wait this long before trying again rather than every minute. */
export const RETRY_AFTER_FAILURE_MS = 60 * 60_000;

export interface BackupRunRecord {
  /** When this run happened (ISO). */
  at: string;
  ok: boolean;
  path?: string;
  filename?: string;
  size?: number;
  error?: string;
  /** When the most recent successful run happened, carried across failures. */
  lastSuccessAt?: string | null;
}

/**
 * Whether a scheduled backup should run now: none has ever succeeded, or the
 * last success is at least `intervalDays` old — unless the last attempt failed
 * within the retry window, so a broken disk is not hammered every minute.
 */
export function isBackupDue(last: BackupRunRecord | null, now: Date, intervalDays: number): boolean {
  const nowMs = now.getTime();
  if (last && !last.ok) {
    const attemptMs = Date.parse(last.at);
    if (Number.isFinite(attemptMs) && nowMs - attemptMs < RETRY_AFTER_FAILURE_MS) return false;
  }
  const lastSuccess = last?.ok ? last.at : last?.lastSuccessAt;
  if (!lastSuccess) return true;
  const successMs = Date.parse(lastSuccess);
  if (!Number.isFinite(successMs)) return true;
  const interval = Math.max(1, Number.isFinite(intervalDays) ? intervalDays : 7) * DAY_MS;
  return nowMs - successMs >= interval;
}

/** When the next scheduled backup becomes due, for display. Null means "now". */
export function nextBackupDueAt(last: BackupRunRecord | null, intervalDays: number): string | null {
  const lastSuccess = last?.ok ? last.at : last?.lastSuccessAt;
  if (!lastSuccess) return null;
  const successMs = Date.parse(lastSuccess);
  if (!Number.isFinite(successMs)) return null;
  return new Date(successMs + Math.max(1, intervalDays) * DAY_MS).toISOString();
}
