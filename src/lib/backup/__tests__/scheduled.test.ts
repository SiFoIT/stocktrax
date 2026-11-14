import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { backupsDir } from "@/lib/backup/files";
import { getLastBackupRecord, maybeRunScheduledBackup, runBackup } from "@/lib/backup/scheduled";

// Runs against the throwaway DB from src/test/setup-unit.ts; backupsDir() is
// next to that file, never data/backups.

const now = new Date("2026-11-14T12:00:00Z");

function reset() {
  for (const t of ["transactions", "holdings", "portfolios", "settings"]) db.run(sql.raw(`DELETE FROM "${t}"`));
  rmSync(backupsDir(), { recursive: true, force: true });
}

beforeEach(() => {
  expect(process.env.STOCKTRAX_DB_PATH).toMatch(/unit-[0-9a-f-]+\.db$/);
  reset();
});
afterEach(reset);

const files = () => {
  try {
    return readdirSync(backupsDir()).sort();
  } catch {
    return [];
  }
};

describe("scheduled backup", () => {
  it("skips an empty database without writing or counting a failure", async () => {
    const result = await maybeRunScheduledBackup(now);
    expect(result).toMatchObject({ ran: true, skipped: "empty database" });
    expect(result.error).toBeUndefined();
    expect(files()).toEqual([]);

    const record = await getLastBackupRecord("scheduled");
    expect(record).toMatchObject({ ok: true, skipped: "empty database", lastSuccessAt: null });

    // Not re-checked every minute.
    expect(await maybeRunScheduledBackup(new Date(now.getTime() + 60_000))).toEqual({ ran: false });
  });

  it("keeps the previous success when skipping", async () => {
    db.insert(schema.portfolios).values({ name: "P", currency: "CAD" }).run();
    expect((await runBackup("scheduled", now)).filename).toBe("stocktrax-backup-2026-11-14.json");
    db.run(sql.raw(`DELETE FROM "portfolios"`));

    const later = new Date(now.getTime() + 8 * 86_400_000);
    expect((await runBackup("scheduled", later)).skipped).toBe("empty database");
    expect(await getLastBackupRecord("scheduled")).toMatchObject({
      skipped: "empty database",
      lastSuccessAt: now.toISOString(),
    });
    expect(files()).toEqual(["stocktrax-backup-2026-11-14.json"]);
  });

  it("never overwrites today's file: scheduled then manual get a suffix", async () => {
    db.insert(schema.portfolios).values({ name: "Good", currency: "CAD" }).run();
    const first = await runBackup("scheduled", now);
    db.insert(schema.portfolios).values({ name: "Second", currency: "USD" }).run();
    const second = await runBackup("manual", now);

    expect(first.filename).toBe("stocktrax-backup-2026-11-14.json");
    expect(second.filename).toBe("stocktrax-backup-2026-11-14-2.json");
    expect(files()).toEqual(["stocktrax-backup-2026-11-14-2.json", "stocktrax-backup-2026-11-14.json"]);

    const original = JSON.parse(readFileSync(join(backupsDir(), first.filename!), "utf-8"));
    expect(original.data.portfolios).toHaveLength(1);
    expect((await getLastBackupRecord("manual"))?.filename).toBe("stocktrax-backup-2026-11-14-2.json");
  });

  it("still backs up an empty database when asked manually", async () => {
    const result = await runBackup("manual", now);
    expect(result.skipped).toBeUndefined();
    expect(files()).toEqual(["stocktrax-backup-2026-11-14.json"]);
  });
});
