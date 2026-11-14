/**
 * Which SMTP fields the digest settings expose, and how a submitted value is
 * written. Kept free of the DB so the decision can be tested on its own.
 */

/** Settings key and default of each editable SMTP field (not the password). */
export const SMTP_FIELDS = {
  host: { key: "smtp.host", fallback: "" },
  port: { key: "smtp.port", fallback: 587 },
  secure: { key: "smtp.secure", fallback: false },
  user: { key: "smtp.user", fallback: "" },
  from: { key: "smtp.from", fallback: "" },
  to: { key: "smtp.to", fallback: "" },
} as const;

export type SmtpField = keyof typeof SMTP_FIELDS;

export type SmtpWrite = { action: "set"; value: string | number | boolean } | { action: "clear" };

/**
 * A value equal to the env fallback is not stored: storing it would pin
 * today's env value in the DB, so a later change to the env var would be
 * ignored. The stored row is removed instead and the env value shows through.
 */
export function smtpWrite(
  value: string | number | boolean,
  envValue: string | number | boolean | undefined
): SmtpWrite {
  if (envValue !== undefined && value === envValue) return { action: "clear" };
  return { action: "set", value };
}
