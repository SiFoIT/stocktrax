/**
 * Counts of Yahoo Finance calls and failures, for the status page.
 *
 * Kept in memory (on globalThis, so a dev hot reload doesn't reset it) in
 * hourly buckets for the last 24 hours. It starts empty when the server
 * restarts; `since` says when counting began so the page can say so.
 */

export interface YahooErrorSample {
  at: string;
  kind: string;
  symbol: string;
  message: string;
}

export interface YahooStats {
  /** When counting began (server start). */
  since: string;
  last24h: { calls: number; errors: number; byKind: Record<string, { calls: number; errors: number }> };
  /** Most recent failures, newest first (at most 20). */
  recentErrors: YahooErrorSample[];
}

interface Bucket {
  hour: number;
  byKind: Record<string, { calls: number; errors: number }>;
}

interface State {
  since: string;
  buckets: Bucket[];
  recentErrors: YahooErrorSample[];
}

const HOUR_MS = 3_600_000;

const state: State = ((globalThis as { __stocktraxYahooStats?: State }).__stocktraxYahooStats ??= {
  since: new Date().toISOString(),
  buckets: [],
  recentErrors: [],
});

function bucketFor(now: number): Bucket {
  const hour = Math.floor(now / HOUR_MS);
  let bucket = state.buckets[state.buckets.length - 1];
  if (!bucket || bucket.hour !== hour) {
    bucket = { hour, byKind: {} };
    state.buckets.push(bucket);
    // Keep 24 hours plus the current one.
    while (state.buckets.length > 25) state.buckets.shift();
  }
  return bucket;
}

/** Record one Yahoo request of `kind` ("quote", "chart", "summary", ...). */
export function recordYahooCall(kind: string, ok: boolean, symbol = "", error?: unknown): void {
  const now = Date.now();
  const bucket = bucketFor(now);
  const entry = (bucket.byKind[kind] ??= { calls: 0, errors: 0 });
  entry.calls++;
  if (!ok) {
    entry.errors++;
    state.recentErrors.unshift({
      at: new Date(now).toISOString(),
      kind,
      symbol,
      message: error instanceof Error ? error.message : String(error ?? "unknown error"),
    });
    state.recentErrors.length = Math.min(state.recentErrors.length, 20);
  }
}

export function getYahooStats(now = Date.now()): YahooStats {
  const cutoff = Math.floor(now / HOUR_MS) - 24;
  const byKind: YahooStats["last24h"]["byKind"] = {};
  let calls = 0;
  let errors = 0;
  for (const bucket of state.buckets) {
    if (bucket.hour <= cutoff) continue;
    for (const [kind, c] of Object.entries(bucket.byKind)) {
      const k = (byKind[kind] ??= { calls: 0, errors: 0 });
      k.calls += c.calls;
      k.errors += c.errors;
      calls += c.calls;
      errors += c.errors;
    }
  }
  return { since: state.since, last24h: { calls, errors, byKind }, recentErrors: [...state.recentErrors] };
}
