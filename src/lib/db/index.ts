import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

/**
 * `STOCKTRAX_DB_PATH` points the app at another SQLite file. The route tests
 * set it to a throwaway database in a temp dir; unset, the path is
 * `<cwd>/data/stocktrax.db` as it has always been.
 */
function resolveDbPath(): string {
  const override = process.env.STOCKTRAX_DB_PATH;
  if (override) return override;

  const dataDir = join(process.cwd(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return join(dataDir, "stocktrax.db");
}

/** What `drizzle()` returns: the typed client plus the raw better-sqlite3 handle. */
type AppDatabase = BetterSQLite3Database<typeof schema> & { $client: InstanceType<typeof Database> };

let instance: AppDatabase | undefined;

/**
 * Opened on first use, not when the module loads. `next build` imports every
 * route in parallel workers to collect page data; when each of those opened
 * the file and switched it to WAL at the same moment, one lost the lock race
 * and the build died with SQLITE_BUSY. Nothing at build time needs the
 * database. The first request, or the scheduler's first tick, opens it once
 * per process, exactly as before.
 */
function open(): AppDatabase {
  if (!instance) {
    const sqlite = new Database(resolveDbPath());
    sqlite.pragma("journal_mode = WAL");
    instance = drizzle(sqlite, { schema });
  }
  return instance;
}

/**
 * The shared Drizzle client: a proxy over the lazily opened instance, so the
 * many `db.select()` call sites stay as they are. Methods are bound to the
 * real instance because Drizzle's builders rely on `this`.
 */
export const db: AppDatabase = new Proxy({} as AppDatabase, {
  get(_target, prop) {
    const real = open();
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
