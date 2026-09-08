"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Eye, Loader2, Mail, Send, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { DEFAULT_TIMEZONE, resolveTimezone, TIMEZONE_GROUPS, TIMEZONES } from "@/lib/timezones";
import { cn } from "@/lib/utils";

interface SmtpForm {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasPassword: boolean;
  from: string;
  to: string;
}

interface DigestForm {
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  timezone: string;
  watchlistMovePct: number;
  showDollars: boolean;
  skipQuietDays: boolean;
  quietThresholdPct: number;
}

interface LastLog {
  kind: string;
  status: string;
  subject: string | null;
  error: string | null;
  sentAt: string;
}

interface DigestSettingsResponse {
  smtp: SmtpForm;
  digest: DigestForm;
  lastLog: LastLog | null;
}

type Feedback = { tone: "positive" | "negative"; message: string } | null;

const FIELD =
  "w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-subtle-foreground focus:border-primary focus:outline-none";
const LABEL = "block text-xs font-medium text-muted-foreground mb-1.5";
const SECTION = "rounded-lg border border-border overflow-hidden";
const SECTION_HEAD = "px-4 py-2.5 border-b border-border bg-accent";
const BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50";
const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50";

function Toggle({
  checked,
  onChange,
  label,
  hint,
  className,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border-border-strong accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export function DigestSettingsModal({ onClose }: { onClose: () => void }) {
  const [smtp, setSmtp] = useState<SmtpForm | null>(null);
  const [digest, setDigest] = useState<DigestForm | null>(null);
  const [lastLog, setLastLog] = useState<LastLog | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/digest");
      if (!res.ok) throw new Error("Could not load settings");
      const data: DigestSettingsResponse = await res.json();
      setSmtp(data.smtp);
      setDigest(data.digest);
      setLastLog(data.lastLog);
    } catch {
      setFeedback({ tone: "negative", message: "Could not load digest settings." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The browser knows the user's zone; the server cannot guess it. Resolved
  // against the offered list so a reader in, say, Winnipeg lands on Central
  // rather than on the default.
  useEffect(() => {
    setDigest((current) => {
      if (!current || current.timezone) return current;
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return { ...current, timezone: resolveTimezone(detected ?? DEFAULT_TIMEZONE) };
    });
  }, []);

  const save = async (): Promise<boolean> => {
    if (!smtp || !digest) return false;
    setBusy("save");
    setFeedback(null);
    try {
      const res = await fetch("/api/settings/digest", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtp: {
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            user: smtp.user,
            // Left blank means "keep the stored password".
            pass: password || undefined,
            from: smtp.from,
            to: smtp.to,
          },
          digest,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save settings");
      setPassword("");
      setSmtp({ ...smtp, hasPassword: smtp.hasPassword || password.length > 0 });
      setFeedback({ tone: "positive", message: "Settings saved." });
      return true;
    } catch (error) {
      setFeedback({
        tone: "negative",
        message: error instanceof Error ? error.message : "Could not save settings",
      });
      return false;
    } finally {
      setBusy(null);
    }
  };

  /** Every send saves first, so the user is never testing stale settings. */
  const send = async (kind: "daily" | "weekly" | "smtp-test", action: string) => {
    if (!(await save())) return;
    setBusy(action);
    setFeedback(null);
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, test: true }),
      });
      const body = await res.json();
      if (body.status === "sent") {
        setFeedback({ tone: "positive", message: `Sent: ${body.subject}` });
      } else {
        setFeedback({ tone: "negative", message: body.error ?? "Send failed" });
      }
      void load();
    } catch (error) {
      setFeedback({
        tone: "negative",
        message: error instanceof Error ? error.message : "Send failed",
      });
    } finally {
      setBusy(null);
    }
  };

  const body = () => {
    if (loading || !smtp || !digest) {
      return (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading settings
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Delivery */}
        <section className={SECTION}>
          <div className={SECTION_HEAD}>
            <h3 className="text-sm font-semibold text-foreground">Delivery</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Any SMTP relay. For Gmail use an App Password, not your account password.
            </p>
          </div>
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={LABEL} htmlFor="smtp-host">SMTP host</label>
                <input
                  id="smtp-host"
                  className={FIELD}
                  value={smtp.host}
                  placeholder="smtp.gmail.com"
                  onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="smtp-port">Port</label>
                <input
                  id="smtp-port"
                  className={FIELD}
                  type="number"
                  value={smtp.port}
                  onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })}
                />
              </div>
            </div>

            <Toggle
              checked={smtp.secure}
              onChange={(secure) => setSmtp({ ...smtp, secure })}
              label="Implicit TLS"
              hint="On for port 465. Port 587 upgrades with STARTTLS on its own."
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="smtp-user">Username</label>
                <input
                  id="smtp-user"
                  className={FIELD}
                  value={smtp.user}
                  placeholder="you@gmail.com"
                  onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="smtp-pass">App password</label>
                <input
                  id="smtp-pass"
                  className={FIELD}
                  type="password"
                  value={password}
                  placeholder={smtp.hasPassword ? "Saved" : "16 characters"}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={LABEL} htmlFor="smtp-from">From</label>
              <input
                id="smtp-from"
                className={FIELD}
                value={smtp.from}
                placeholder="StockTrax <you@gmail.com>"
                onChange={(e) => setSmtp({ ...smtp, from: e.target.value })}
              />
            </div>

            <div>
              <label className={LABEL} htmlFor="smtp-to">To</label>
              <input
                id="smtp-to"
                className={FIELD}
                value={smtp.to}
                placeholder="you@example.com, someone@example.com"
                onChange={(e) => setSmtp({ ...smtp, to: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Separate multiple recipients with commas.
              </p>
            </div>

            <button
              type="button"
              className={BUTTON}
              disabled={busy !== null}
              onClick={() => send("smtp-test", "smtp-test")}
            >
              {busy === "smtp-test" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              Send test email
            </button>
          </div>
        </section>

        {/* Schedule */}
        <section className={SECTION}>
          <div className={SECTION_HEAD}>
            <h3 className="text-sm font-semibold text-foreground">Schedule</h3>
          </div>
          <div className="space-y-3 p-4">
            <Toggle
              checked={digest.dailyEnabled}
              onChange={(dailyEnabled) => setDigest({ ...digest, dailyEnabled })}
              label="Daily digest"
              hint="Trading days at 5:00 PM Eastern, after the close."
            />

            <Toggle
              checked={digest.weeklyEnabled}
              onChange={(weeklyEnabled) => setDigest({ ...digest, weeklyEnabled })}
              label="Weekly digest"
              hint="Saturdays at 8:00 AM your time, covering the week just ended."
            />

            <div>
              <label className={LABEL} htmlFor="digest-tz">
                Your timezone — sets when the weekly arrives
              </label>
              <select
                id="digest-tz"
                className={FIELD}
                value={digest.timezone}
                onChange={(e) => setDigest({ ...digest, timezone: e.target.value })}
              >
                {/* A zone saved before this list existed still shows itself. */}
                {digest.timezone && !TIMEZONES.some((z) => z.id === digest.timezone) && (
                  <option value={digest.timezone}>{digest.timezone}</option>
                )}
                {TIMEZONE_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Content */}
        <section className={SECTION}>
          <div className={SECTION_HEAD}>
            <h3 className="text-sm font-semibold text-foreground">Content</h3>
          </div>
          <div className="space-y-3 p-4">
            <div>
              <label className={LABEL} htmlFor="digest-threshold">
                Watchlist move threshold
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="digest-threshold"
                  className={cn(FIELD, "w-24")}
                  type="number"
                  step="0.5"
                  min="0"
                  value={digest.watchlistMovePct}
                  onChange={(e) =>
                    setDigest({ ...digest, watchlistMovePct: Number(e.target.value) })
                  }
                />
                <span className="text-sm text-muted-foreground">
                  % — zero leaves the watchlist out of the daily
                </span>
              </div>
            </div>

            <Toggle
              checked={digest.showDollars}
              onChange={(showDollars) => setDigest({ ...digest, showDollars })}
              label="Show dollar values"
              hint="Off keeps every percentage but drops the amounts."
            />

            <Toggle
              checked={digest.skipQuietDays}
              onChange={(skipQuietDays) => setDigest({ ...digest, skipQuietDays })}
              label="Skip quiet days"
              hint="Hold the daily back when nothing moved, no alert fired and no dividend arrived."
            />

            {digest.skipQuietDays && (
              <div className="flex items-center gap-2 pl-7">
                <input
                  aria-label="Quiet day threshold"
                  className={cn(FIELD, "w-24")}
                  type="number"
                  step="0.1"
                  min="0"
                  value={digest.quietThresholdPct}
                  onChange={(e) =>
                    setDigest({ ...digest, quietThresholdPct: Number(e.target.value) })
                  }
                />
                <span className="text-sm text-muted-foreground">% portfolio move counts as news</span>
              </div>
            )}
          </div>
        </section>

        {/* Actions */}
        <section className={SECTION}>
          <div className={SECTION_HEAD}>
            <h3 className="text-sm font-semibold text-foreground">Send now</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Test sends use live data and never replace a scheduled email.
            </p>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={BUTTON}
                disabled={busy !== null}
                onClick={() => send("daily", "daily")}
              >
                {busy === "daily" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Send daily now
              </button>
              <button
                type="button"
                className={BUTTON}
                disabled={busy !== null}
                onClick={() => send("weekly", "weekly")}
              >
                {busy === "weekly" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Send weekly now
              </button>
              <a
                className={BUTTON}
                href="/api/digest/preview?kind=daily"
                target="_blank"
                rel="noreferrer"
              >
                <Eye className="size-4" />
                Preview
              </a>
            </div>

            {lastLog && (
              <p className="text-xs text-muted-foreground">
                Last {lastLog.kind}:{" "}
                {lastLog.status === "sent"
                  ? "sent"
                  : lastLog.status === "skipped"
                    ? "skipped (quiet day)"
                    : `failed — ${lastLog.error}`}{" "}
                on {new Date(lastLog.sentAt).toLocaleString()}
              </p>
            )}
          </div>
        </section>

        <div className="flex items-center justify-between gap-4">
          {feedback ? (
            <p
              className={`flex items-center gap-2 text-sm ${
                feedback.tone === "positive" ? "text-positive" : "text-negative"
              }`}
            >
              {feedback.tone === "positive" ? (
                <Check className="size-4 shrink-0" />
              ) : (
                <TriangleAlert className="size-4 shrink-0" />
              )}
              <span className="min-w-0 break-words">{feedback.message}</span>
            </p>
          ) : (
            <span />
          )}
          <button
            type="button"
            className={`${PRIMARY_BUTTON} shrink-0`}
            disabled={busy !== null}
            onClick={() => void save()}
          >
            {busy === "save" && <Loader2 className="size-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Email digest"
      subtitle="A daily and weekly summary of your portfolio and watchlists"
      maxWidth="max-w-lg"
    >
      {body()}
    </Modal>
  );
}
