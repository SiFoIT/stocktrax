import { NextRequest, NextResponse } from "next/server";
import { existsSync, statSync } from "fs";
import { join } from "path";
import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getDigestConfig, getSetting, getSmtpConfig, isSmtpConfigured } from "@/lib/settings";
import { getYahooStats } from "@/lib/market-data/stats";
import { getPortfolioSummary } from "@/lib/portfolio-summary";
import { backupsDir, dataDir, listBackupFiles } from "@/lib/backup/files";
import { getBackupConfig, getLastBackupRecord } from "@/lib/backup/scheduled";
import {
  evaluateBackups,
  evaluateCache,
  evaluateDataQuality,
  evaluateDigest,
  evaluateSnapshots,
  evaluateYahoo,
  formatBytes,
  worst,
} from "./evaluate";
import type { DatabaseStatus, DataQualityStatus, StatusResponse } from "./types";

export const dynamic = "force-dynamic";

const STALE_CACHE_MS = 7 * 86_400_000;

function fileSize(path: string): number {
  try {
    return existsSync(path) ? statSync(path).size : 0;
  } catch {
    return 0;
  }
}

/**
 * Health of the background machinery: digest sends, snapshots, Yahoo, quote
 * coverage, the cache, backups and the database file.
 *
 * `?quick=1` skips the portfolio summary (the one part that can call Yahoo
 * when its cache has expired), for the settings menu's error dot.
 */
export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const quick = new URL(request.url).searchParams.get("quick") === "1";

    const [digestConfig, smtp, lastSentDaily, lastSentWeekly, logRows] = await Promise.all([
      getDigestConfig(),
      getSmtpConfig(),
      getSetting<string | null>("digest.lastSent.daily", null),
      getSetting<string | null>("digest.lastSent.weekly", null),
      db.select().from(schema.digestLog).orderBy(desc(schema.digestLog.sentAt)).limit(8),
    ]);
    const timezone = digestConfig.timezone;

    const digest = evaluateDigest({
      now,
      timezone,
      smtpConfigured: isSmtpConfigured(smtp),
      dailyEnabled: digestConfig.dailyEnabled,
      weeklyEnabled: digestConfig.weeklyEnabled,
      lastSentDaily,
      lastSentWeekly,
      recent: logRows.map((r) => ({
        kind: r.kind,
        status: r.status,
        subject: r.subject,
        error: r.error,
        sentAt: r.sentAt.toISOString(),
      })),
    });

    const [snapshotAgg] = await db
      .select({
        latest: sql<string | null>`max(${schema.portfolioSnapshots.date})`,
        count: sql<number>`count(*)`,
      })
      .from(schema.portfolioSnapshots);
    const [portfolioAgg] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.portfolios);
    const snapshots = evaluateSnapshots({
      now,
      latestDate: snapshotAgg?.latest ?? null,
      rowCount: Number(snapshotAgg?.count ?? 0),
      portfolioCount: Number(portfolioAgg?.count ?? 0),
    });

    const yahoo = evaluateYahoo(getYahooStats(now.getTime()), now, timezone);

    let dataQuality: DataQualityStatus;
    if (quick) {
      dataQuality = evaluateDataQuality(null, { checked: false });
    } else {
      try {
        const summary = await getPortfolioSummary();
        dataQuality = evaluateDataQuality(summary.missing, { checked: true });
      } catch (error) {
        dataQuality = evaluateDataQuality(null, {
          checked: true,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // fetched_at is stored in epoch seconds.
    const staleCutoff = Math.floor((now.getTime() - STALE_CACHE_MS) / 1000);
    const [cacheAgg] = await db
      .select({
        rows: sql<number>`count(*)`,
        bytes: sql<number>`coalesce(sum(length(${schema.stockCache.data})), 0)`,
        stale: sql<number>`coalesce(sum(case when ${schema.stockCache.fetchedAt} < ${staleCutoff} then 1 else 0 end), 0)`,
      })
      .from(schema.stockCache);
    const cache = evaluateCache(
      Number(cacheAgg?.rows ?? 0),
      Number(cacheAgg?.bytes ?? 0),
      Number(cacheAgg?.stale ?? 0)
    );

    const dir = backupsDir();
    const [backupConfig, lastScheduled] = await Promise.all([
      getBackupConfig(),
      getLastBackupRecord("scheduled"),
    ]);
    const backups = evaluateBackups({
      now,
      timezone,
      ...backupConfig,
      lastScheduled,
      files: listBackupFiles(dir),
      dir,
    });

    const dbPath = join(dataDir(), "stocktrax.db");
    const dbBytes = fileSize(dbPath);
    const walBytes = fileSize(`${dbPath}-wal`);
    const database: DatabaseStatus = {
      status: "ok",
      summary: `${formatBytes(dbBytes)} database${walBytes ? `, ${formatBytes(walBytes)} write-ahead log` : ""}`,
      notes: [],
      path: dbPath,
      bytes: dbBytes,
      walBytes,
    };

    const body: StatusResponse = {
      generatedAt: now.toISOString(),
      overall: worst([
        digest.status,
        snapshots.status,
        yahoo.status,
        dataQuality.status,
        cache.status,
        backups.status,
        database.status,
      ]),
      timezone,
      digest,
      snapshots,
      yahoo,
      dataQuality,
      cache,
      backups,
      database,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("[status] failed:", error);
    return NextResponse.json({ error: "Failed to load status" }, { status: 500 });
  }
}
