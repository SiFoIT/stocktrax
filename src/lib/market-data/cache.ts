import { db, schema } from "@/lib/db";
import { eq, inArray, lt, sql } from "drizzle-orm";

/**
 * The one cache every Yahoo read goes through.
 *
 * - Rows live in `stock_cache` under a `y:` key, so any route, the summary,
 *   the digest and the screener share one copy of each symbol's data.
 * - Concurrent misses for the same key share one in-flight fetch.
 * - A failed fetch is remembered for a minute (the negative cache) so an
 *   outage or a rate limit isn't hammered by every request, and in the
 *   meantime the last good value is served if it is not older than
 *   `maxStaleMs`.
 */

export interface CacheOptions {
  /** Bypass a fresh cached value (a manual refresh). Still deduped. */
  fresh?: boolean;
  /** How old a cached value may be to serve when the fetch fails. */
  maxStaleMs?: number;
}

const NEGATIVE_TTL_MS = 60_000;

interface State {
  inFlight: Map<string, Promise<unknown>>;
  failedUntil: Map<string, number>;
}

const state: State = ((globalThis as { __stocktraxCache?: State }).__stocktraxCache ??= {
  inFlight: new Map(),
  failedUntil: new Map(),
});

interface Row<T> {
  value: T;
  fetchedAt: number;
}

export async function readCacheRow<T>(key: string): Promise<Row<T> | null> {
  const row = await db.query.stockCache.findFirst({ where: eq(schema.stockCache.symbol, key) });
  if (!row) return null;
  try {
    return { value: JSON.parse(row.data) as T, fetchedAt: row.fetchedAt.getTime() };
  } catch {
    return null;
  }
}

export async function writeCacheRow(key: string, value: unknown, fetchedAt = new Date()): Promise<void> {
  const data = JSON.stringify(value);
  await db
    .insert(schema.stockCache)
    .values({ symbol: key, data, fetchedAt })
    .onConflictDoUpdate({ target: schema.stockCache.symbol, set: { data, fetchedAt } });
}

/**
 * `fetcher` resolves null (or throws) on failure; a null is never cached.
 * Returns the cached value while it is younger than `ttlMs`.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: (previous: Row<T> | null) => Promise<T | null>,
  options: CacheOptions = {}
): Promise<T | null> {
  const row = await readCacheRow<T>(key);
  const now = Date.now();
  if (row && !options.fresh && now - row.fetchedAt < ttlMs) return row.value;

  const stale = () =>
    row && now - row.fetchedAt < (options.maxStaleMs ?? Number.POSITIVE_INFINITY) ? row.value : null;

  if ((state.failedUntil.get(key) ?? 0) > now) return stale();

  const pending = state.inFlight.get(key) as Promise<T | null> | undefined;
  if (pending) return pending;

  const run = (async () => {
    let value: T | null = null;
    try {
      value = await fetcher(row);
    } catch {
      value = null;
    }
    if (value == null) {
      state.failedUntil.set(key, Date.now() + NEGATIVE_TTL_MS);
      return stale();
    }
    state.failedUntil.delete(key);
    await writeCacheRow(key, value);
    return value;
  })();

  state.inFlight.set(key, run);
  try {
    return await run;
  } finally {
    state.inFlight.delete(key);
  }
}

/**
 * Collects calls made within a few milliseconds of each other and resolves
 * them with one batched request: the portfolio page, the summary and the
 * digest all ask for many quotes at once, and Yahoo answers an array of
 * symbols in about the time of one.
 */
export function createBatcher<T>(
  run: (keys: string[]) => Promise<Map<string, T>>,
  { maxBatch = 50, waitMs = 10 } = {}
): (key: string) => Promise<T | null> {
  let queue: { key: string; resolve: (v: T | null) => void }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    timer = null;
    const batch = queue;
    queue = [];
    for (let i = 0; i < batch.length; i += maxBatch) {
      const chunk = batch.slice(i, i + maxBatch);
      const keys = [...new Set(chunk.map((c) => c.key))];
      let results = new Map<string, T>();
      try {
        results = await run(keys);
      } catch {
        // Every caller in the chunk gets null; each records its own failure.
      }
      for (const c of chunk) c.resolve(results.get(c.key) ?? null);
    }
  };

  return (key: string) =>
    new Promise<T | null>((resolve) => {
      queue.push({ key, resolve });
      if (!timer) timer = setTimeout(flush, waitMs);
    });
}

/** Rows that must survive pruning however old they are. */
const KEEP_KEYS = new Set(["USDCAD_LAST_GOOD"]);

/**
 * Delete cache rows not refreshed in `olderThanMs` (leftovers from symbols no
 * longer followed and from retired key schemes), then reclaim the space.
 * Returns how many rows went.
 */
export async function pruneCache(olderThanMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const old = await db
    .select({ symbol: schema.stockCache.symbol })
    .from(schema.stockCache)
    .where(lt(schema.stockCache.fetchedAt, cutoff));
  const doomed = old.map((r) => r.symbol).filter((k) => !KEEP_KEYS.has(k));
  for (let i = 0; i < doomed.length; i += 200) {
    await db.delete(schema.stockCache).where(inArray(schema.stockCache.symbol, doomed.slice(i, i + 200)));
  }
  if (doomed.length > 50) db.run(sql`VACUUM`);
  return doomed.length;
}
