import { defineConfig } from "drizzle-kit";

// drizzle-kit runs in Node (not the Worker), so it reads a direct Postgres URL
// from the environment. Migrations are applied ONLY via drizzle-kit / CI, never
// at Worker startup.
//
//   pnpm db:generate   # generate SQL migrations from src/db/schema.ts
//   DATABASE_URL=... pnpm db:migrate   # apply them (against the direct DB URL)
//
// Pre-production: there's no data to preserve, so resetting history and
// dropping/recreating the database is fine (see backend-workers/README.md).
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/comerico",
  },
  casing: "snake_case",
});
