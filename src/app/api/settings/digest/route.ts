import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/http/body";
import { z } from "zod";
import {
  clearSetting,
  envSetting,
  envSettingName,
  getDigestConfig,
  getSetting,
  parseRecipients,
  resolveSetting,
  setSettings,
  type SettingSource,
} from "@/lib/settings";
import { SMTP_FIELDS, smtpWrite, type SmtpField } from "./smtp-fields";
import { getRecentSends } from "@/lib/digest/send";
import { loadPortfolioCoverage } from "@/lib/import/coverage";
import { isReminderEnabled } from "@/lib/digest/import-reminder";

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
      /** Remove the stored password (an env SMTP_PASS still applies). */
      clearPass: z.boolean().optional(),
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
      importReminderEnabled: z.boolean(),
      /** Per-portfolio choices to merge over the stored ones, keyed by id. */
      importReminderPortfolios: z.record(z.string().regex(/^\d+$/), z.boolean()),
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
    const fieldNames = Object.keys(SMTP_FIELDS) as SmtpField[];
    const [config, fields, pass, recent, coverage] = await Promise.all([
      getDigestConfig(),
      Promise.all(
        fieldNames.map((name) =>
          resolveSetting<string | number | boolean>(SMTP_FIELDS[name].key, SMTP_FIELDS[name].fallback)
        )
      ),
      resolveSetting("smtp.pass", ""),
      getRecentSends(1),
      loadPortfolioCoverage(),
    ]);
    const smtp = Object.fromEntries(fieldNames.map((name, i) => [name, fields[i].value]));
    // Per field: where the value comes from, and the env var behind it, so
    // the modal can show env values as hints instead of saving them back.
    const sources = Object.fromEntries(
      fieldNames.map((name, i) => [name, fields[i].source])
    ) as Record<SmtpField | "pass", SettingSource>;
    sources.pass = pass.source;
    const envNames = Object.fromEntries(
      [...fieldNames, "pass"].map((name) => [name, envSettingName(`smtp.${name}`) ?? null])
    );

    const [lastDaily, lastWeekly] = await Promise.all([
      getSetting<string | null>("digest.lastSent.daily", null),
      getSetting<string | null>("digest.lastSent.weekly", null),
    ]);

    return NextResponse.json({
      smtp: {
        ...smtp,
        to: parseRecipients(String(smtp.to)).join(", "),
        // The password is write-only: only its presence is ever reported.
        hasPassword: pass.value.length > 0,
        sources,
        envNames,
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
      importReminder: {
        enabled: config.importReminderEnabled,
        portfolios: coverage.map((p) => ({
          ...p,
          enabled: isReminderEnabled(p, config.importReminderPortfolios),
        })),
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
    const body = settingsSchema.parse(await readJsonBody(request));
    const updates: Record<string, unknown> = {};
    const clears: string[] = [];

    if (body.smtp) {
      const { pass, clearPass, ...fields } = body.smtp;
      if (fields.to !== undefined) {
        const recipients = parseRecipients(fields.to);
        const invalid = recipients.filter((address) => !address.includes("@"));
        if (invalid.length > 0) {
          return NextResponse.json(
            { error: `Not an email address: ${invalid.join(", ")}` },
            { status: 400 }
          );
        }
        fields.to = recipients.join(", ");
      }
      // The modal sends only the fields the user changed. A value equal to
      // the env fallback is not stored, so later env changes still apply.
      for (const name of Object.keys(SMTP_FIELDS) as SmtpField[]) {
        const value = fields[name];
        if (value === undefined) continue;
        const { key, fallback } = SMTP_FIELDS[name];
        let envValue = envSetting<string | number | boolean>(key, fallback);
        if (name === "to" && typeof envValue === "string") {
          envValue = parseRecipients(envValue).join(", ");
        }
        const write = smtpWrite(value, envValue);
        if (write.action === "clear") clears.push(key);
        else updates[key] = write.value;
      }
      // An empty password field means the user did not retype it.
      if (pass) updates["smtp.pass"] = pass;
      else if (clearPass) clears.push("smtp.pass");
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
      if (d.importReminderEnabled !== undefined)
        updates["digest.importReminder.enabled"] = d.importReminderEnabled;
      if (d.importReminderPortfolios !== undefined) {
        const stored = await getSetting<Record<string, boolean>>(
          "digest.importReminder.portfolios",
          {}
        );
        updates["digest.importReminder.portfolios"] = {
          ...stored,
          ...d.importReminderPortfolios,
        };
      }
    }

    await setSettings(updates);
    for (const key of clears) await clearSetting(key);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid settings" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save digest settings" }, { status: 500 });
  }
}
