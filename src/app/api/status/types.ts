/**
 * Response shape of `GET /api/status`. Shared by the route and the status
 * modal, so it carries no server imports.
 */

export type StatusLevel = "ok" | "warning" | "error";

export interface StatusSection {
  status: StatusLevel;
  /** One plain-language line, e.g. "Daily digest failed Nov 13, 17:01: auth error". */
  summary: string;
  /** Further plain-language lines, when there is more than one thing to say. */
  notes: string[];
}

export interface DigestLogRow {
  kind: string;
  status: string;
  subject: string | null;
  error: string | null;
  sentAt: string;
}

export interface DigestStatus extends StatusSection {
  smtpConfigured: boolean;
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  lastSentDaily: string | null;
  lastSentWeekly: string | null;
  /** The trading day whose daily should have gone out by now, if any. */
  expectedDaily: string | null;
  recent: DigestLogRow[];
  latestFailure: DigestLogRow | null;
}

export interface SnapshotStatus extends StatusSection {
  latestDate: string | null;
  rowCount: number;
  portfolioCount: number;
  /** Today in market time (America/New_York). */
  today: string;
  /** The latest trading day whose snapshot should exist by now. */
  expectedDate: string | null;
  /** Whether a snapshot for `today` is expected at this point of the day. */
  todayExpected: boolean;
  todayMissing: boolean;
}

export interface YahooStatus extends StatusSection {
  /** When in-memory counting began (server start). */
  since: string;
  calls: number;
  errors: number;
  errorRate: number;
  byKind: Record<string, { calls: number; errors: number }>;
  recentErrors: { at: string; kind: string; symbol: string; message: string }[];
}

export interface DataQualityStatus extends StatusSection {
  /** False when the quick variant skipped the portfolio summary. */
  checked: boolean;
  missingSymbols: string[];
  staleExchangeRate: boolean;
}

export interface CacheStatus extends StatusSection {
  rows: number;
  bytes: number;
  staleRows: number;
}

export interface BackupStatus extends StatusSection {
  enabled: boolean;
  keep: number;
  intervalDays: number;
  lastScheduled: {
    at: string;
    ok: boolean;
    path?: string;
    filename?: string;
    size?: number;
    error?: string;
    lastSuccessAt?: string | null;
  } | null;
  newestFile: { name: string; size: number; date: string; modifiedAt: string } | null;
  fileCount: number;
  dir: string;
}

export interface DatabaseStatus extends StatusSection {
  path: string;
  bytes: number;
  walBytes: number;
}

export interface StatusResponse {
  generatedAt: string;
  /** Worst of all sections. */
  overall: StatusLevel;
  /** Zone the times in summaries are written in (the digest timezone). */
  timezone: string;
  digest: DigestStatus;
  snapshots: SnapshotStatus;
  yahoo: YahooStatus;
  dataQuality: DataQualityStatus;
  cache: CacheStatus;
  backups: BackupStatus;
  database: DatabaseStatus;
}
