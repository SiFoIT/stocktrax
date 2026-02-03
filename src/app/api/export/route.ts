import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  portfolios,
  holdings,
  transactions,
  watchlists,
  watchlistItems,
} from "@/lib/db/schema";
import { BACKUP_VERSION, BackupData } from "@/lib/backup/settings-registry";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const destination = url.searchParams.get("destination");
    const settingsParam = url.searchParams.get("settings");

    // Query all user data tables
    const [
      portfoliosData,
      holdingsData,
      transactionsData,
      watchlistsData,
      watchlistItemsData,
    ] = await Promise.all([
      db.select().from(portfolios),
      db.select().from(holdings),
      db.select().from(transactions),
      db.select().from(watchlists),
      db.select().from(watchlistItems),
    ]);

    // Parse settings from query param (passed from client)
    let settings: BackupData["settings"] = {
      theme: null,
      defaultTab: null,
      chartPreferences: {},
    };
    if (settingsParam) {
      try {
        settings = JSON.parse(settingsParam);
      } catch {
        // Use defaults if parsing fails
      }
    }

    const backup: BackupData = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        portfolios: portfoliosData,
        holdings: holdingsData,
        transactions: transactionsData,
        watchlists: watchlistsData,
        watchlistItems: watchlistItemsData,
      },
      settings,
    };

    const jsonContent = JSON.stringify(backup, null, 2);

    // Handle iCloud destination
    if (destination === "icloud") {
      const homeDir = process.env.HOME;
      if (!homeDir) {
        return NextResponse.json(
          { error: "HOME environment variable not set" },
          { status: 500 }
        );
      }

      const icloudPath = join(
        homeDir,
        "Library/Mobile Documents/com~apple~CloudDocs/StockTrax"
      );

      // Create directory if it doesn't exist
      if (!existsSync(icloudPath)) {
        mkdirSync(icloudPath, { recursive: true });
      }

      const date = new Date().toISOString().split("T")[0];
      const filename = `stocktrax-backup-${date}.json`;
      const filepath = join(icloudPath, filename);

      writeFileSync(filepath, jsonContent, "utf-8");

      return NextResponse.json({
        success: true,
        path: filepath,
        filename,
      });
    }

    // Default: return as downloadable file
    const date = new Date().toISOString().split("T")[0];
    const filename = `stocktrax-backup-${date}.json`;

    return new NextResponse(jsonContent, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 }
    );
  }
}

// Check if iCloud path exists
export async function HEAD() {
  try {
    const homeDir = process.env.HOME;
    if (!homeDir) {
      return new NextResponse(null, { status: 404 });
    }

    const icloudBasePath = join(
      homeDir,
      "Library/Mobile Documents/com~apple~CloudDocs"
    );

    if (existsSync(icloudBasePath)) {
      return new NextResponse(null, { status: 200 });
    }

    return new NextResponse(null, { status: 404 });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
