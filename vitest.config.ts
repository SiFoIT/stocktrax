import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.route.test.ts", "**/node_modules/**"],
          // Same schema-only template as the route tests: anything that loads
          // `@/lib/db` gets a throwaway copy, and yahoo-finance2 always throws.
          globalSetup: ["src/test/global-setup.ts"],
          setupFiles: ["src/test/setup-unit.ts"],
        },
      },
      {
        // Route handlers called directly against a throwaway SQLite file per
        // test file (STOCKTRAX_DB_PATH), never data/stocktrax.db.
        extends: true,
        test: {
          name: "routes",
          include: ["src/app/api/**/__tests__/*.route.test.ts"],
          globalSetup: ["src/test/global-setup.ts"],
          setupFiles: ["src/test/setup-route-db.ts"],
        },
      },
    ],
  },
});
