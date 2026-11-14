import { beforeEach, describe, expect, it, vi } from "vitest";
import { cached, readCacheRow, writeCacheRow } from "@/lib/market-data/cache";

// Runs against the throwaway DB from src/test/setup-unit.ts.

let n = 0;
let key: string;
beforeEach(() => {
  key = `test:cache:${++n}`;
});

describe("cached", () => {
  it("serves a fresh row without fetching", async () => {
    await writeCacheRow(key, { v: 1 });
    const fetcher = vi.fn(async () => ({ v: 2 }));
    expect(await cached(key, 60_000, fetcher)).toEqual({ v: 1 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("remembers a failure and serves stale without refetching", async () => {
    await writeCacheRow(key, { v: 1 }, new Date(Date.now() - 120_000));
    const failing = vi.fn(async () => null);
    expect(await cached(key, 60_000, failing)).toEqual({ v: 1 });
    expect(failing).toHaveBeenCalledTimes(1);

    const next = vi.fn(async () => ({ v: 2 }));
    expect(await cached(key, 60_000, next)).toEqual({ v: 1 });
    expect(next).not.toHaveBeenCalled();
  });

  it("lets a fresh (manual) refresh through the negative cache", async () => {
    await writeCacheRow(key, { v: 1 }, new Date(Date.now() - 120_000));
    await cached(key, 60_000, async () => {
      throw new Error("rate limited");
    });

    const next = vi.fn(async () => ({ v: 2 }));
    expect(await cached(key, 60_000, next, { fresh: true })).toEqual({ v: 2 });
    expect(next).toHaveBeenCalledTimes(1);
    expect((await readCacheRow<{ v: number }>(key))?.value).toEqual({ v: 2 });

    // The success cleared the failure, so automatic reads use the new row.
    const auto = vi.fn(async () => ({ v: 3 }));
    expect(await cached(key, 60_000, auto)).toEqual({ v: 2 });
    expect(auto).not.toHaveBeenCalled();
  });

  it("still dedups a fresh refresh against an in-flight fetch", async () => {
    let release!: (v: { v: number }) => void;
    const slow = vi.fn(() => new Promise<{ v: number }>((r) => (release = r)));
    const first = cached(key, 60_000, slow);
    await vi.waitFor(() => expect(slow).toHaveBeenCalled());

    const other = vi.fn(async () => ({ v: 9 }));
    const second = cached(key, 60_000, other, { fresh: true });
    release({ v: 5 });
    expect(await first).toEqual({ v: 5 });
    expect(await second).toEqual({ v: 5 });
    expect(other).not.toHaveBeenCalled();
  });

  it("never touches the real database", () => {
    expect(process.env.STOCKTRAX_DB_PATH).toMatch(/unit-[0-9a-f-]+\.db$/);
  });
});
