import { NextResponse } from "next/server";
import { backupsDir, listBackupFiles, nextBackupDueAt } from "@/lib/backup/files";
import { getBackupConfig, getLastBackupRecord, runBackup } from "@/lib/backup/scheduled";

export const dynamic = "force-dynamic";

/** Backup files on disk, newest first, plus the last scheduled and manual runs. */
export async function GET() {
  try {
    const dir = backupsDir();
    const [config, lastScheduled, lastManual] = await Promise.all([
      getBackupConfig(),
      getLastBackupRecord("scheduled"),
      getLastBackupRecord("manual"),
    ]);
    return NextResponse.json({
      dir,
      config,
      files: listBackupFiles(dir),
      lastScheduled,
      lastManual,
      nextDueAt: config.enabled ? nextBackupDueAt(lastScheduled, config.intervalDays) : null,
    });
  } catch {
    return NextResponse.json({ error: "Failed to list backups" }, { status: 500 });
  }
}

/** Run a backup now, with the same writer and retention as the scheduled one. */
export async function POST() {
  const result = await runBackup("manual");
  if (!result.ran) {
    return NextResponse.json({ error: result.error ?? "Backup did not run" }, { status: 409 });
  }
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    path: result.path,
    filename: result.filename,
    size: result.size,
    removed: result.removed ?? [],
  });
}
