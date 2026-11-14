import { drizzle } from "drizzle-orm/better-sqlite3";
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

const sqlite = new Database(resolveDbPath());
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

export { schema };
