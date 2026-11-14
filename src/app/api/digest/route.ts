import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/http/body";
import { z } from "zod";
import { sendDigest, sendTestEmail } from "@/lib/digest/send";
import { MARKET_TIMEZONE, zonedDateStr } from "@/lib/digest/time";
import { setSetting } from "@/lib/settings";

export const runtime = "nodejs";

const bodySchema = z.object({
  kind: z.enum(["daily", "weekly", "smtp-test"]),
  /**
   * The settings modal sends `true`: mark the subject and leave the
   * scheduler's state alone. An external cron omits it to perform the real
   * send; a send that didn't fail then moves the matching last-sent marker to
   * today's market date (as the in-process scheduler does), so the scheduler
   * won't send the same digest again. Snapshots are not written here: they
   * stay the scheduler's job, which writes them on its own tick.
   */
  test: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { kind, test = false } = bodySchema.parse(await readJsonBody(request));

    if (kind === "smtp-test") {
      const result = await sendTestEmail();
      return NextResponse.json(result, { status: result.status === "failed" ? 502 : 200 });
    }

    // Mirrors runTick in src/lib/digest/scheduler.ts: the marker is the
    // market date at send time, and a failure leaves it alone.
    const now = new Date();
    const result = await sendDigest(kind, { test, now });
    if (!test && result.status !== "failed") {
      await setSetting(`digest.lastSent.${kind}`, zonedDateStr(now, MARKET_TIMEZONE));
    }

    return NextResponse.json(result, { status: result.status === "failed" ? 502 : 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to send digest" }, { status: 500 });
  }
}
