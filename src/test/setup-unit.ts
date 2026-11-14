// Vitest setupFile for the "unit" project. Runs in each unit test file's
// worker before the test file is imported, so a unit test that (directly or
// through some import chain) loads `@/lib/db` opens a throwaway copy of the
// schema-only template, never data/stocktrax.db, and nothing reaches Yahoo.
import { copyFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { inject, vi } from "vitest";

const dbPath = join(inject("routeTestTempDir"), `unit-${randomUUID()}.db`);
copyFileSync(inject("routeTestTemplateDb"), dbPath);
process.env.STOCKTRAX_DB_PATH = dbPath;

vi.mock("yahoo-finance2", () => {
  const fail = () => {
    throw new Error("yahoo-finance2 is not available in unit tests; mock the fetcher or @/lib/api/yahoo-finance");
  };
  const client = new Proxy({}, { get: () => fail });
  return { default: function YahooFinance() { return client; } };
});
