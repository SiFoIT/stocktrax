import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  isBackupDue,
  isBackupFilename,
  listBackupFiles,
  nextBackupDueAt,
  pruneBackups,
  RETRY_AFTER_FAILURE_MS,
  selectForDeletion,
  writeBackupFile,
} from "@/lib/backup/files";

describe("isBackupFilename", () => {
  it("accepts the exact backup pattern", () => {
    expect(isBackupFilename("stocktrax-backup-2026-11-14.json")).toBe(true);
  });

  it.each([
    "../stocktrax-backup-2026-11-14.json",
    "stocktrax-backup-2026-11-14.json/../../etc/passwd",
    "stocktrax-backup-2026-11-14.json.tmp",
    ".stocktrax-backup-2026-11-14.json.123.tmp",
    "stocktrax-backup-2026-1-14.json",
    "stocktrax-backup-latest.json",
    "stocktrax.db",
    "",
  ])("rejects %j", (name) => {
    expect(isBackupFilename(name)).toBe(false);
  });
});

describe("selectForDeletion", () => {
  const names = [
    "stocktrax-backup-2026-01-03.json",
    "stocktrax-backup-2026-01-10.json",
    "stocktrax-backup-2026-01-01.json",
    "stocktrax-backup-2026-01-17.json",
    "notes.txt",
    "stocktrax.db",
  ];

  it("keeps the newest N by date and selects the rest", () => {
    expect(selectForDeletion(names, 2)).toEqual([
      "stocktrax-backup-2026-01-03.json",
      "stocktrax-backup-2026-01-01.json",
    ]);
  });

  it("never selects files outside the pattern", () => {
    expect(selectForDeletion(names, 1)).not.toContain("notes.txt");
    expect(selectForDeletion(names, 1)).not.toContain("stocktrax.db");
  });

  it("selects nothing when under the limit", () => {
    expect(selectForDeletion(names, 8)).toEqual([]);
  });

  it("always keeps at least one", () => {
    expect(selectForDeletion(names, 0)).toHaveLength(3);
    expect(selectForDeletion(names, Number.NaN)).toHaveLength(3);
  });
});

describe("files on disk", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "stocktrax-backups-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes, lists newest first and prunes only backup files", () => {
    for (const d of ["2026-01-01", "2026-01-08", "2026-01-15"]) {
      writeBackupFile(dir, `stocktrax-backup-${d}.json`, `{"d":"${d}"}`);
    }
    writeFileSync(join(dir, "keep-me.json"), "{}");

    const listed = listBackupFiles(dir);
    expect(listed.map((f) => f.date)).toEqual(["2026-01-15", "2026-01-08", "2026-01-01"]);
    expect(listed[0].size).toBe('{"d":"2026-01-15"}'.length);

    expect(pruneBackups(dir, 2)).toEqual(["stocktrax-backup-2026-01-01.json"]);
    expect(readdirSync(dir).sort()).toEqual([
      "keep-me.json",
      "stocktrax-backup-2026-01-08.json",
      "stocktrax-backup-2026-01-15.json",
    ]);
  });

  it("leaves no temp file behind and refuses bad names", () => {
    writeBackupFile(dir, "stocktrax-backup-2026-02-01.json", "{}");
    expect(readdirSync(dir)).toEqual(["stocktrax-backup-2026-02-01.json"]);
    expect(() => writeBackupFile(dir, "../evil.json", "{}")).toThrow();
  });

  it("creates the directory on first write and lists a missing one as empty", () => {
    const nested = join(dir, "backups");
    expect(listBackupFiles(nested)).toEqual([]);
    writeBackupFile(nested, "stocktrax-backup-2026-02-01.json", "{}");
    expect(listBackupFiles(nested)).toHaveLength(1);
  });
});

describe("isBackupDue", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  it("is due when nothing has ever run", () => {
    expect(isBackupDue(null, now, 7)).toBe(true);
  });

  it("is not due within the interval and due once it has passed", () => {
    expect(isBackupDue({ at: daysAgo(6.9), ok: true }, now, 7)).toBe(false);
    expect(isBackupDue({ at: daysAgo(7), ok: true }, now, 7)).toBe(true);
  });

  it("waits out the retry window after a failure", () => {
    const recentFailure = new Date(now.getTime() - RETRY_AFTER_FAILURE_MS / 2).toISOString();
    expect(isBackupDue({ at: recentFailure, ok: false, error: "EACCES", lastSuccessAt: daysAgo(10) }, now, 7)).toBe(
      false
    );
    const oldFailure = new Date(now.getTime() - RETRY_AFTER_FAILURE_MS * 2).toISOString();
    expect(isBackupDue({ at: oldFailure, ok: false, lastSuccessAt: daysAgo(10) }, now, 7)).toBe(true);
  });

  it("uses the carried-forward success time after an old failure", () => {
    const oldFailure = new Date(now.getTime() - RETRY_AFTER_FAILURE_MS * 2).toISOString();
    expect(isBackupDue({ at: oldFailure, ok: false, lastSuccessAt: daysAgo(2) }, now, 7)).toBe(false);
  });

  it("treats a corrupt timestamp as due", () => {
    expect(isBackupDue({ at: "garbage", ok: true }, now, 7)).toBe(true);
  });

  it("reports when the next one falls due", () => {
    expect(nextBackupDueAt({ at: "2026-11-01T00:00:00.000Z", ok: true }, 7)).toBe("2026-11-08T00:00:00.000Z");
    expect(nextBackupDueAt(null, 7)).toBeNull();
  });
});
