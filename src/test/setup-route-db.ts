// Vitest setupFile for the "routes" project. Runs in each route test file's
// worker before the test file (and so before `@/lib/db`) is imported.
import { copyFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { inject, vi } from "vitest";

// A throwaway copy of the schema-only template, one per test file. Every
// route under test then opens this file instead of data/stocktrax.db.
const dbPath = join(inject("routeTestTempDir"), `${randomUUID()}.db`);
copyFileSync(inject("routeTestTemplateDb"), dbPath);
process.env.STOCKTRAX_DB_PATH = dbPath;

// Never reach Yahoo from a route test. Anything not faked by the test file's
// own `vi.mock("@/lib/api/yahoo-finance", ...)` fails loudly here instead.
vi.mock("yahoo-finance2", () => {
  const fail = () => {
    throw new Error("yahoo-finance2 is not available in route tests; mock @/lib/api/yahoo-finance");
  };
  const client = new Proxy({}, { get: () => fail });
  return { default: function YahooFinance() { return client; } };
});
