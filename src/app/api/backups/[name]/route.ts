import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { backupsDir, isBackupFilename } from "@/lib/backup/files";

/** Download one backup file. The name must match the backup pattern exactly. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  // The pattern admits no separators or dots beyond ".json", so it cannot escape the directory.
  if (!isBackupFilename(name)) {
    return NextResponse.json({ error: "Invalid backup name" }, { status: 400 });
  }

  let content: Buffer;
  try {
    content = readFileSync(join(backupsDir(), name));
  } catch {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
