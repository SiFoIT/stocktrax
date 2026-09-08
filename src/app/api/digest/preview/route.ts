import { NextRequest, NextResponse } from "next/server";
import { getDigestConfig } from "@/lib/settings";
import { buildDailyDigest, buildWeeklyDigest } from "@/lib/digest/build";
import { renderHtml, renderText } from "@/lib/digest/render";

export const runtime = "nodejs";

/**
 * The email as it would be sent, without sending it. Backs the Preview button
 * in settings and makes the renderers inspectable during development.
 */
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind") === "weekly" ? "weekly" : "daily";
    const asText = params.get("format") === "text";

    const config = await getDigestConfig();
    const data =
      kind === "weekly" ? await buildWeeklyDigest(new Date(), config) : await buildDailyDigest(new Date(), config);

    const options = { showDollars: config.showDollars };
    const body = asText ? renderText(data, options) : renderHtml(data, options);

    return new NextResponse(body, {
      headers: {
        "Content-Type": asText ? "text/plain; charset=utf-8" : "text/html; charset=utf-8",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to build digest preview" }, { status: 500 });
  }
}
