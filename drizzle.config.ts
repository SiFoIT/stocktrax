import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    // Same override as src/lib/db/index.ts; default unchanged.
    url: process.env.STOCKTRAX_DB_PATH || "./data/stocktrax.db",
  },
});
