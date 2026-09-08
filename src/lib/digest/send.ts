import nodemailer from "nodemailer";
import { db, schema } from "@/lib/db";
import { desc } from "drizzle-orm";
import { getDigestConfig, getSmtpConfig, type SmtpConfig } from "@/lib/settings";
import { buildDailyDigest, buildWeeklyDigest } from "@/lib/digest/build";
import { digestSubject, renderHtml, renderText } from "@/lib/digest/render";
import { isQuietDay } from "@/lib/digest/types";
import type { DigestData } from "@/lib/digest/types";
import type { DigestKind, DigestStatus } from "@/lib/db/schema";

export interface SendResult {
  status: DigestStatus;
  kind: DigestKind;
  subject: string | null;
  error: string | null;
  sentAt: Date;
}

/** Missing connection details are a configuration problem, not a mail error. */
function assertConfigured(config: SmtpConfig): void {
  const missing: string[] = [];
  if (!config.host) missing.push("host");
  if (!config.from) missing.push("from address");
  if (config.to.length === 0) missing.push("recipient");
  if (missing.length > 0) {
    throw new Error(`Email is not configured: missing ${missing.join(", ")}.`);
  }
}

function createTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // Port 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: config.secure || config.port === 465,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });
}

async function log(entry: Omit<SendResult, "sentAt">): Promise<SendResult> {
  const sentAt = new Date();
  await db.insert(schema.digestLog).values({
    kind: entry.kind,
    status: entry.status,
    subject: entry.subject,
    error: entry.error,
    sentAt,
  });
  return { ...entry, sentAt };
}

/** Errors reach the settings modal verbatim, so keep them short and readable. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export interface SendDigestOptions {
  /**
   * A manual send from the settings modal. Prefixes the subject and leaves the
   * scheduler's state alone: no snapshots are written, no `lastSent` marker is
   * moved, and the quiet-day rule does not apply.
   */
  test?: boolean;
  now?: Date;
}

export async function sendDigest(
  kind: "daily" | "weekly",
  options: SendDigestOptions = {}
): Promise<SendResult> {
  const { test = false, now = new Date() } = options;

  try {
    const [config, smtp] = await Promise.all([getDigestConfig(), getSmtpConfig()]);
    assertConfigured(smtp);

    const data: DigestData =
      kind === "daily"
        ? await buildDailyDigest(now, config)
        : await buildWeeklyDigest(now, config);

    if (!test && kind === "daily" && config.skipQuietDays) {
      if (isQuietDay(data as Parameters<typeof isQuietDay>[0], config.quietThresholdPct)) {
        return log({ kind, status: "skipped", subject: null, error: "quiet day" });
      }
    }

    const subject = test ? `[Test] ${digestSubject(data)}` : digestSubject(data);
    const renderOptions = { showDollars: config.showDollars };

    await createTransport(smtp).sendMail({
      from: smtp.from,
      to: smtp.to,
      subject,
      text: renderText(data, renderOptions),
      html: renderHtml(data, renderOptions),
    });

    return log({ kind, status: "sent", subject, error: null });
  } catch (error) {
    return log({ kind, status: "failed", subject: null, error: describeError(error) });
  }
}

/** A plain message that only proves the SMTP settings work. */
export async function sendTestEmail(): Promise<SendResult> {
  try {
    const smtp = await getSmtpConfig();
    assertConfigured(smtp);

    const subject = "StockTrax test email";
    await createTransport(smtp).sendMail({
      from: smtp.from,
      to: smtp.to,
      subject,
      text: "This is a test from StockTrax. Your email settings are working.",
    });

    return log({ kind: "test", status: "sent", subject, error: null });
  } catch (error) {
    return log({ kind: "test", status: "failed", subject: null, error: describeError(error) });
  }
}

export async function getRecentSends(limit = 5) {
  return db.query.digestLog.findMany({
    orderBy: [desc(schema.digestLog.sentAt)],
    limit,
  });
}
