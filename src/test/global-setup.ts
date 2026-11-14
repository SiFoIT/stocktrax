// Vitest globalSetup for the "routes" project.
//
// Builds one template SQLite database from `src/lib/db/schema.ts` (the same
// DDL `drizzle-kit push` would run on an empty file) in a fresh temp dir, and
// hands its path to every route test file. Each file then copies the template
// (see setup-route-db.ts), so schema generation runs once per `npm test`.
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { TestProject } from "vitest/node";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import * as schema from "@/lib/db/schema";

declare module "vitest" {
  export interface ProvidedContext {
    /** Path of the schema-only template DB that each route test file copies. */
    routeTestTemplateDb: string;
    /** Temp dir holding the template and every per-file copy. */
    routeTestTempDir: string;
  }
}

export default async function setup(project: TestProject) {
  const dir = mkdtempSync(join(tmpdir(), "stocktrax-route-tests-"));
  const templatePath = join(dir, "template.db");

  const empty = await generateSQLiteDrizzleJson({});
  const current = await generateSQLiteDrizzleJson(schema as Record<string, unknown>);
  const statements = await generateSQLiteMigration(empty, current);

  const sqlite = new Database(templatePath);
  try {
    sqlite.exec(statements.join(";\n"));
  } finally {
    sqlite.close();
  }

  project.provide("routeTestTemplateDb", templatePath);
  project.provide("routeTestTempDir", dir);

  return () => {
    rmSync(dir, { recursive: true, force: true });
  };
}
