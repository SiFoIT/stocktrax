import { db, schema } from "@/lib/db";
import { eq, like } from "drizzle-orm";

/**
 * Server-side settings, stored JSON-encoded in the `settings` table.
 *
 * Client preferences live in localStorage; this exists only for what the
 * server itself has to know without a browser attached — SMTP credentials and
 * the digest schedule. Env vars act as a fallback for the connection details
 * so a Docker deployment can be configured headlessly.
 */

/** Env fallback for keys a headless deployment needs to set without the UI. */
const ENV_FALLBACK: Record<string, string | undefined> = {
  "smtp.host": "SMTP_HOST",
  "smtp.port": "SMTP_PORT",
  "smtp.secure": "SMTP_SECURE",
  "smtp.user": "SMTP_USER",
  "smtp.pass": "SMTP_PASS",
  "smtp.from": "DIGEST_FROM",
  "smtp.to": "DIGEST_TO",
  "digest.appUrl": "DIGEST_APP_URL",
};

/** Keys never returned to the browser and never written to a backup. */
export const SECRET_SETTING_KEYS = ["smtp.pass"] as const;

/** Keys excluded from backup because they are per-deployment run state. */
export const TRANSIENT_SETTING_KEYS = [
  "digest.lastSent.daily",
  "digest.lastSent.weekly",
] as const;

export const DIGEST_DEFAULTS = {
  "digest.daily.enabled": false,
  "digest.weekly.enabled": false,
  "digest.daily.time": "17:00",
  "digest.weekly.time": "08:00",
  "digest.timezone": "America/Toronto",
  "digest.watchlistMovePct": 2,
  "digest.showDollars": true,
  "digest.skipQuietDays": false,
  "digest.quietThresholdPct": 0.5,
  "digest.appUrl": "",
} as const;

/**
 * Coerce an env string into the shape the caller's default implies. Env vars
 * are always strings, but `smtp.port` must be a number and `smtp.secure` a
 * boolean or the transport rejects them.
 */
function coerceEnv<T>(raw: string, fallback: T): T {
  if (typeof fallback === "number") {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : fallback) as T;
  }
  if (typeof fallback === "boolean") {
    return (raw === "true" || raw === "1") as T;
  }
  return raw as T;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, key),
  });

  if (row) {
    try {
      const parsed = JSON.parse(row.value) as T;
      // An empty stored string means "not configured", so fall through to env.
      if (parsed !== "" && parsed !== null && parsed !== undefined) return parsed;
    } catch {
      // Corrupt row: fall through to env, then the default.
    }
  }

  const envName = ENV_FALLBACK[key];
  const envValue = envName ? process.env[envName] : undefined;
  if (envValue !== undefined && envValue !== "") {
    return coerceEnv(envValue, fallback);
  }

  return fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const encoded = JSON.stringify(value ?? null);
  await db
    .insert(schema.settings)
    .values({ key, value: encoded, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: encoded, updatedAt: new Date() },
    });
}

export async function setSettings(entries: Record<string, unknown>): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    await setSetting(key, value);
  }
}

/** Every stored setting whose key starts with `prefix`, JSON-decoded. */
export async function getSettings(prefix: string): Promise<Record<string, unknown>> {
  const rows = await db
    .select()
    .from(schema.settings)
    .where(like(schema.settings.key, `${prefix}%`));

  const out: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string[];
}

/** Recipients are stored as one comma-separated string. */
export function parseRecipients(raw: string): string[] {
  return raw
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

export async function getSmtpConfig(): Promise<SmtpConfig> {
  const [host, port, secure, user, pass, from, to] = await Promise.all([
    getSetting("smtp.host", ""),
    getSetting("smtp.port", 587),
    getSetting("smtp.secure", false),
    getSetting("smtp.user", ""),
    getSetting("smtp.pass", ""),
    getSetting("smtp.from", ""),
    getSetting("smtp.to", ""),
  ]);

  return { host, port, secure, user, pass, from, to: parseRecipients(to) };
}

export interface DigestConfig {
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  dailyTime: string;
  weeklyTime: string;
  timezone: string;
  watchlistMovePct: number;
  showDollars: boolean;
  skipQuietDays: boolean;
  quietThresholdPct: number;
  appUrl: string;
}

export async function getDigestConfig(): Promise<DigestConfig> {
  const [
    dailyEnabled,
    weeklyEnabled,
    dailyTime,
    weeklyTime,
    timezone,
    watchlistMovePct,
    showDollars,
    skipQuietDays,
    quietThresholdPct,
    appUrl,
  ] = await Promise.all([
    getSetting("digest.daily.enabled", DIGEST_DEFAULTS["digest.daily.enabled"] as boolean),
    getSetting("digest.weekly.enabled", DIGEST_DEFAULTS["digest.weekly.enabled"] as boolean),
    getSetting("digest.daily.time", DIGEST_DEFAULTS["digest.daily.time"] as string),
    getSetting("digest.weekly.time", DIGEST_DEFAULTS["digest.weekly.time"] as string),
    getSetting("digest.timezone", DIGEST_DEFAULTS["digest.timezone"] as string),
    getSetting("digest.watchlistMovePct", DIGEST_DEFAULTS["digest.watchlistMovePct"] as number),
    getSetting("digest.showDollars", DIGEST_DEFAULTS["digest.showDollars"] as boolean),
    getSetting("digest.skipQuietDays", DIGEST_DEFAULTS["digest.skipQuietDays"] as boolean),
    getSetting("digest.quietThresholdPct", DIGEST_DEFAULTS["digest.quietThresholdPct"] as number),
    getSetting("digest.appUrl", DIGEST_DEFAULTS["digest.appUrl"] as string),
  ]);

  return {
    dailyEnabled,
    weeklyEnabled,
    dailyTime,
    weeklyTime,
    timezone,
    watchlistMovePct,
    showDollars,
    skipQuietDays,
    quietThresholdPct,
    appUrl,
  };
}
