import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getDigestConfig,
  getSetting,
  getSmtpConfig,
  parseRecipients,
  setSettings,
} from "@/lib/settings";
import { getRecentSends } from "@/lib/digest/send";

export const runtime = "nodejs";

const settingsSchema = z.object({
  smtp: z
    .object({
      host: z.string().trim().max(255),
      port: z.coerce.number().int().min(1).max(65535),
      secure: z.boolean(),
      user: z.string().trim().max(255),
      /** Omitted or empty means "keep the stored password". */
      pass: z.string().max(512).optional(),
      from: z.string().trim().max(255),
      to: z.string().trim().max(2000),
    })
    .partial()
    .optional(),
  digest: z
    .object({
      dailyEnabled: z.boolean(),
      weeklyEnabled: z.boolean(),
      // A zone Intl rejects would throw inside every scheduler tick, so it is
      // refused here rather than logged once a minute forever.
      timezone: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .refine(isValidTimezone, "Unknown timezone"),
      watchlistMovePct: z.coerce.number().min(0).max(100),
      showDollars: z.boolean(),
      skipQuietDays: z.boolean(),
      quietThresholdPct: z.coerce.number().min(0).max(100),
    })
    .partial()
    .optional(),
});

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const [config, smtp, recent] = await Promise.all([
      getDigestConfig(),
      getSmtpConfig(),
      getRecentSends(1),
    ]);

    const [lastDaily, lastWeekly] = await Promise.all([
      getSetting<string | null>("digest.lastSent.daily", null),
      getSetting<string | null>("digest.lastSent.weekly", null),
    ]);

    return NextResponse.json({
      smtp: {
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        user: smtp.user,
        // The password is write-only: only its presence is ever reported.
        hasPassword: smtp.pass.length > 0,
        from: smtp.from,
        to: smtp.to.join(", "),
      },
      digest: {
        dailyEnabled: config.dailyEnabled,
        weeklyEnabled: config.weeklyEnabled,
        timezone: config.timezone,
        watchlistMovePct: config.watchlistMovePct,
        showDollars: config.showDollars,
        skipQuietDays: config.skipQuietDays,
        quietThresholdPct: config.quietThresholdPct,
      },
      lastSent: { daily: lastDaily, weekly: lastWeekly },
      lastLog: recent[0] ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Failed to read digest settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = settingsSchema.parse(await request.json());
    const updates: Record<string, unknown> = {};

    if (body.smtp) {
      const { host, port, secure, user, pass, from, to } = body.smtp;
      if (host !== undefined) updates["smtp.host"] = host;
      if (port !== undefined) updates["smtp.port"] = port;
      if (secure !== undefined) updates["smtp.secure"] = secure;
      if (user !== undefined) updates["smtp.user"] = user;
      if (from !== undefined) updates["smtp.from"] = from;
      if (to !== undefined) {
        const recipients = parseRecipients(to);
        const invalid = recipients.filter((address) => !address.includes("@"));
        if (invalid.length > 0) {
          return NextResponse.json(
            { error: `Not an email address: ${invalid.join(", ")}` },
            { status: 400 }
          );
        }
        updates["smtp.to"] = recipients.join(", ");
      }
      // An empty password field means the user did not retype it.
      if (pass) updates["smtp.pass"] = pass;
    }

    if (body.digest) {
      const d = body.digest;
      if (d.dailyEnabled !== undefined) updates["digest.daily.enabled"] = d.dailyEnabled;
      if (d.weeklyEnabled !== undefined) updates["digest.weekly.enabled"] = d.weeklyEnabled;
      if (d.timezone !== undefined) updates["digest.timezone"] = d.timezone;
      if (d.watchlistMovePct !== undefined)
        updates["digest.watchlistMovePct"] = d.watchlistMovePct;
      if (d.showDollars !== undefined) updates["digest.showDollars"] = d.showDollars;
      if (d.skipQuietDays !== undefined) updates["digest.skipQuietDays"] = d.skipQuietDays;
      if (d.quietThresholdPct !== undefined)
        updates["digest.quietThresholdPct"] = d.quietThresholdPct;
    }

    await setSettings(updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid settings" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save digest settings" }, { status: 500 });
  }
}
