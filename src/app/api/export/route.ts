import { NextRequest, NextResponse } from "next/server";
import { BackupData } from "@/lib/backup/settings-registry";
import { backupFilename, buildBackup } from "@/lib/backup/build";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const destination = url.searchParams.get("destination");
    const settingsParam = url.searchParams.get("settings");

    // Parse settings from query param (passed from client)
    let clientSettings: BackupData["settings"] | undefined;
    if (settingsParam) {
      try {
        clientSettings = JSON.parse(settingsParam);
      } catch {
        // Use defaults if parsing fails
      }
    }

    const now = new Date();
    const backup = await buildBackup({ clientSettings, now });
    const jsonContent = JSON.stringify(backup, null, 2);
    const filename = backupFilename(now);

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

      const filepath = join(icloudPath, filename);

      writeFileSync(filepath, jsonContent, "utf-8");

      return NextResponse.json({
        success: true,
        path: filepath,
        filename,
      });
    }

    // Default: return as downloadable file
    return new NextResponse(jsonContent, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
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
