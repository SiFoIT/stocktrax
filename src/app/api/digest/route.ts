import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendDigest, sendTestEmail } from "@/lib/digest/send";

export const runtime = "nodejs";

const bodySchema = z.object({
  kind: z.enum(["daily", "weekly", "smtp-test"]),
  /**
   * The settings modal sends `true`: mark the subject and leave the
   * scheduler's state alone. An external cron omits it to perform the real
   * send, writing snapshots and moving the last-sent marker.
   */
  test: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { kind, test = false } = bodySchema.parse(await request.json());

    const result =
      kind === "smtp-test" ? await sendTestEmail() : await sendDigest(kind, { test });

    return NextResponse.json(result, { status: result.status === "failed" ? 502 : 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to send digest" }, { status: 500 });
  }
}
