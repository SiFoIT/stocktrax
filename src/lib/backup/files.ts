import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "fs";
import { dirname, join } from "path";

/**
 * Backup files on disk: naming, listing, retention and the due check. Free of
 * the database so it can be tested against a temp directory.
 */

/**
 * The exact shape of a backup file name: `stocktrax-backup-YYYY-MM-DD.json`,
 * or `stocktrax-backup-YYYY-MM-DD-N.json` (N >= 2) for a later backup on the
 * same day. Anything else (including the entrypoint's `pre-migrate-*.db`
 * copies) is never listed, served or deleted.
 */
export const BACKUP_FILE_PATTERN = /^stocktrax-backup-(\d{4}-\d{2}-\d{2})(?:-([2-9]|[1-9]\d+))?\.json$/;

export function isBackupFilename(name: string): boolean {
  return BACKUP_FILE_PATTERN.test(name);
}

/** Date and same-day sequence (1 for the unsuffixed file) of a backup name. */
function parseBackupName(name: string): { date: string; seq: number } | null {
  const m = BACKUP_FILE_PATTERN.exec(name);
  if (!m) return null;
  return { date: m[1], seq: m[2] ? Number(m[2]) : 1 };
}

/** Newest first: by date, then by same-day sequence. */
function compareNewestFirst(a: string, b: string): number {
  const pa = parseBackupName(a);
  const pb = parseBackupName(b);
  if (!pa || !pb) return 0;
  if (pa.date !== pb.date) return pa.date < pb.date ? 1 : -1;
  return pb.seq - pa.seq;
}

/**
 * The directory holding the database — resolved the same way as
 * `src/lib/db/index.ts`: the folder of `STOCKTRAX_DB_PATH` when set, else
 * `<cwd>/data` (in Docker, the mounted `/app/data` volume).
 */
export function dataDir(): string {
  const override = process.env.STOCKTRAX_DB_PATH;
  if (override) return dirname(override);
  return join(process.cwd(), "data");
}

/** Path of the SQLite database file, matching `src/lib/db/index.ts`. */
export function dbFilePath(): string {
  return process.env.STOCKTRAX_DB_PATH || join(dataDir(), "stocktrax.db");
}

export function backupsDir(base: string = dataDir()): string {
  return join(base, "backups");
}

export interface BackupFileInfo {
  name: string;
  size: number;
  /** `YYYY-MM-DD` from the file name (without any same-day suffix). */
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
    const parsed = parseBackupName(name);
    if (!parsed) continue;
    try {
      const stat = statSync(join(dir, name));
      if (!stat.isFile()) continue;
      files.push({
        name,
        size: stat.size,
        date: parsed.date,
        modifiedAt: stat.mtime.toISOString(),
      });
    } catch {
      // Vanished between readdir and stat: skip it.
    }
  }
  return files.sort((a, b) => compareNewestFirst(a.name, b.name));
}

/**
 * Which backup files to delete so that the newest `keep` remain. Names that do
 * not match the backup pattern are never selected. Newest is by the date in the
 * name, then the same-day suffix (`-2` is newer than the unsuffixed file).
 */
export function selectForDeletion(names: string[], keep: number): string[] {
  const keepCount = Math.max(1, Math.floor(Number.isFinite(keep) ? keep : 1));
  const sorted = names.filter(isBackupFilename).sort(compareNewestFirst);
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
 * The first free name for `filename`'s day in `dir`: the name itself, else
 * `-2`, `-3`, ... after the highest same-day suffix already there.
 */
export function nextFreeBackupFilename(dir: string, filename: string): string {
  const parsed = parseBackupName(filename);
  if (!parsed) throw new Error(`Invalid backup filename: ${filename}`);
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    // Missing directory: every name is free.
  }
  let highest = 0;
  for (const name of names) {
    const p = parseBackupName(name);
    if (p && p.date === parsed.date) highest = Math.max(highest, p.seq);
  }
  if (highest === 0) return `stocktrax-backup-${parsed.date}.json`;
  return `stocktrax-backup-${parsed.date}-${highest + 1}.json`;
}

/**
 * Write `content` as a new backup for `filename`'s day in `dir`. Never
 * overwrites: if that day already has a backup, the next `-N` suffix is used.
 * The content goes to a temp file (whose name deliberately does not match the
 * backup pattern), is fsynced, and is then linked into place, which fails
 * rather than replaces if the name was taken meanwhile; so a crash mid-write
 * never leaves a truncated file that looks like a valid backup.
 */
export function writeBackupFile(
  dir: string,
  filename: string,
  content: string
): { path: string; size: number; filename: string } {
  if (!isBackupFilename(filename)) {
    throw new Error(`Invalid backup filename: ${filename}`);
  }
  mkdirSync(dir, { recursive: true });
  const tmpPath = join(dir, `.${filename}.${process.pid}.tmp`);
  const fd = openSync(tmpPath, "w");
  try {
    writeSync(fd, content, null, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const name = nextFreeBackupFilename(dir, filename);
      const finalPath = join(dir, name);
      try {
        linkSync(tmpPath, finalPath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EEXIST") continue;
        // A filesystem without hard links: fall back to a checked rename.
        if (existsSync(finalPath)) continue;
        renameSync(tmpPath, finalPath);
        return { path: finalPath, size: statSync(finalPath).size, filename: name };
      }
      return { path: finalPath, size: statSync(finalPath).size, filename: name };
    }
    throw new Error(`Could not find a free backup name for ${filename}`);
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Already renamed into place.
    }
  }
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
  /**
   * Why a scheduled run wrote nothing (e.g. "empty database"). Not a failure,
   * but not a success either: `lastSuccessAt` carries the previous success.
   */
  skipped?: string;
  /** When the most recent successful run happened, carried across failures. */
  lastSuccessAt?: string | null;
}

/** When the last backup that actually wrote a file happened, if ever. */
export function lastBackupSuccessAt(last: BackupRunRecord | null): string | null {
  if (!last) return null;
  if (last.ok && !last.skipped) return last.at;
  return last.lastSuccessAt ?? null;
}

/**
 * Whether a scheduled backup should run now: none has ever succeeded, or the
 * last success is at least `intervalDays` old — unless the last attempt failed
 * or was skipped within the retry window, so a broken disk (or an empty
 * database) is not re-checked every minute.
 */
export function isBackupDue(last: BackupRunRecord | null, now: Date, intervalDays: number): boolean {
  const nowMs = now.getTime();
  if (last && (!last.ok || last.skipped)) {
    const attemptMs = Date.parse(last.at);
    if (Number.isFinite(attemptMs) && nowMs - attemptMs < RETRY_AFTER_FAILURE_MS) return false;
  }
  const lastSuccess = lastBackupSuccessAt(last);
  if (!lastSuccess) return true;
  const successMs = Date.parse(lastSuccess);
  if (!Number.isFinite(successMs)) return true;
  const interval = Math.max(1, Number.isFinite(intervalDays) ? intervalDays : 7) * DAY_MS;
  return nowMs - successMs >= interval;
}

/** When the next scheduled backup becomes due, for display. Null means "now". */
export function nextBackupDueAt(last: BackupRunRecord | null, intervalDays: number): string | null {
  const lastSuccess = lastBackupSuccessAt(last);
  if (!lastSuccess) return null;
  const successMs = Date.parse(lastSuccess);
  if (!Number.isFinite(successMs)) return null;
  return new Date(successMs + Math.max(1, intervalDays) * DAY_MS).toISOString();
}
