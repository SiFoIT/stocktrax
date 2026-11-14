"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CircleX, Download, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StatusLevel, StatusResponse, StatusSection } from "@/app/api/status/types";

const LEVEL_TEXT: Record<StatusLevel, string> = { ok: "OK", warning: "Warning", error: "Error" };

function LevelIcon({ level, className }: { level: StatusLevel; className?: string }) {
  if (level === "error") return <CircleX className={cn("size-4 shrink-0 text-negative", className)} aria-hidden />;
  if (level === "warning")
    return <TriangleAlert className={cn("size-4 shrink-0 text-warning", className)} aria-hidden />;
  return <CircleCheck className={cn("size-4 shrink-0 text-muted-foreground", className)} aria-hidden />;
}

function levelTextClass(level: StatusLevel): string {
  return level === "error" ? "text-negative" : level === "warning" ? "text-warning" : "text-muted-foreground";
}

function formatTime(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function Section({
  title,
  section,
  children,
}: {
  title: string;
  section: StatusSection;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-b border-border py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <LevelIcon level={section.status} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
            <span className={cn("text-xs font-medium", levelTextClass(section.status))}>
              {LEVEL_TEXT[section.status]}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{section.summary}</p>
          {section.notes.map((note) => (
            <p key={note} className="mt-0.5 text-xs text-muted-foreground">
              {note}
            </p>
          ))}
          {children && <div className="mt-2">{children}</div>}
        </div>
      </div>
    </section>
  );
}

/** Label / value pairs, values in mono. */
function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-subtle-foreground">{label}</dt>
          <dd className="truncate font-mono text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatusModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) throw new Error(`Status request failed (${res.status})`);
      setData((await res.json()) as StatusResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const backupNow = async () => {
    setBackingUp(true);
    setBackupMessage(null);
    try {
      const res = await fetch("/api/backups", { method: "POST" });
      const body = (await res.json()) as { filename?: string; size?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Backup failed (${res.status})`);
      setBackupMessage({
        ok: true,
        text: `Wrote ${body.filename}${body.size !== undefined ? ` (${formatBytes(body.size)})` : ""}`,
      });
      void load();
    } catch (e) {
      setBackupMessage({ ok: false, text: e instanceof Error ? e.message : "Backup failed" });
    } finally {
      setBackingUp(false);
    }
  };

  const tz = data?.timezone ?? "America/Toronto";

  return (
    <Modal
      onClose={onClose}
      title="Status"
      subtitle={data ? `Checked ${formatTime(data.generatedAt, tz)} · times in ${tz}` : undefined}
      maxWidth="max-w-2xl"
      headerRight={
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh status"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </button>
      }
    >
      {error && (
        <p className="flex items-center gap-2 text-sm text-negative">
          <CircleX className="size-4" /> {error}
        </p>
      )}

      {!data && loading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Checking…
        </div>
      )}

      {data && (
        <div>
          <Section title="Email digest" section={data.digest}>
            <Facts
              items={[
                ["Last daily", data.digest.lastSentDaily ?? "never"],
                ["Last weekly", data.digest.lastSentWeekly ?? "never"],
                ["Email", data.digest.smtpConfigured ? "configured" : "not set up"],
              ]}
            />
            {data.digest.recent.length > 0 && (
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left text-subtle-foreground">
                    <th className="py-1 pr-3 font-normal">Sent</th>
                    <th className="py-1 pr-3 font-normal">Kind</th>
                    <th className="py-1 pr-3 font-normal">Result</th>
                    <th className="py-1 font-normal">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {data.digest.recent.map((row) => {
                    const isLatestFailure =
                      data.digest.latestFailure !== null &&
                      row.sentAt === data.digest.latestFailure.sentAt &&
                      row.kind === data.digest.latestFailure.kind;
                    return (
                      <tr
                        key={`${row.sentAt}-${row.kind}`}
                        className={cn("border-t border-border align-top", isLatestFailure && "bg-muted")}
                      >
                        <td className="py-1 pr-3 font-mono whitespace-nowrap text-foreground">
                          {formatTime(row.sentAt, tz)}
                        </td>
                        <td className="py-1 pr-3 text-muted-foreground capitalize">{row.kind}</td>
                        <td
                          className={cn(
                            "py-1 pr-3",
                            row.status === "failed" ? "font-medium text-negative" : "text-muted-foreground"
                          )}
                        >
                          {row.status}
                        </td>
                        <td className="py-1 break-words text-muted-foreground">
                          {row.status === "failed" ? row.error ?? "unknown error" : row.subject ?? ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Snapshots" section={data.snapshots}>
            <Facts
              items={[
                ["Latest", data.snapshots.latestDate ?? "none"],
                ["Rows", data.snapshots.rowCount],
                [
                  "Today (ET)",
                  data.snapshots.todayExpected
                    ? data.snapshots.todayMissing
                      ? "missing"
                      : "written"
                    : "not due yet",
                ],
              ]}
            />
          </Section>

          <Section title="Yahoo Finance" section={data.yahoo}>
            <Facts
              items={[
                ["Calls", data.yahoo.calls],
                ["Errors", data.yahoo.errors],
                ["Error rate", `${(data.yahoo.errorRate * 100).toFixed(1)}%`],
              ]}
            />
            {Object.keys(data.yahoo.byKind).length > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {Object.entries(data.yahoo.byKind)
                  .sort((a, b) => b[1].calls - a[1].calls)
                  .map(([kind, c]) => (
                    <span key={kind} className="mr-3 inline-block">
                      {kind}{" "}
                      <span className="font-mono text-foreground">
                        {c.calls}/{c.errors}
                      </span>
                    </span>
                  ))}
                <span className="text-subtle-foreground">(calls/errors)</span>
              </p>
            )}
            {data.yahoo.recentErrors.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                {data.yahoo.recentErrors.slice(0, 5).map((e, i) => (
                  <li key={`${e.at}-${i}`} className="truncate">
                    <span className="font-mono">{formatTime(e.at, tz)}</span> {e.kind}
                    {e.symbol && <span className="font-mono"> {e.symbol}</span>}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Data quality" section={data.dataQuality} />

          <Section title="Quote cache" section={data.cache}>
            <Facts
              items={[
                ["Entries", data.cache.rows],
                ["Size", formatBytes(data.cache.bytes)],
                ["Older than 7d", data.cache.staleRows],
              ]}
            />
          </Section>

          <Section title="Backups" section={data.backups}>
            <Facts
              items={[
                ["Schedule", data.backups.enabled ? `every ${data.backups.intervalDays}d` : "off"],
                ["Files", `${data.backups.fileCount} / ${data.backups.keep}`],
                ["Newest", data.backups.newestFile ? data.backups.newestFile.date : "none"],
              ]}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="xs" variant="outline" onClick={() => void backupNow()} disabled={backingUp}>
                {backingUp && <Loader2 className="animate-spin" />}
                Back up now
              </Button>
              {data.backups.newestFile && (
                <a
                  href={`/api/backups/${encodeURIComponent(data.backups.newestFile.name)}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Download className="size-3.5" />
                  Download newest
                </a>
              )}
              {backupMessage && (
                <span className={cn("text-xs", backupMessage.ok ? "text-muted-foreground" : "text-negative")}>
                  {backupMessage.text}
                </span>
              )}
            </div>
            <p className="mt-1.5 truncate font-mono text-xs text-subtle-foreground" title={data.backups.dir}>
              {data.backups.dir}
            </p>
          </Section>

          <Section title="Database" section={data.database}>
            <p className="truncate font-mono text-xs text-subtle-foreground" title={data.database.path}>
              {data.database.path}
            </p>
          </Section>
        </div>
      )}
    </Modal>
  );
}
