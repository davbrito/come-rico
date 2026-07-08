import { defineConfig } from "vitest/config";

// Node project for DB-backed contract tests. These run against an embedded
// PGlite Postgres (not workerd), so the tenant-isolation guarantees are
// exercised on a real SQL engine.
export default defineConfig({
  test: {
    name: "node",
    include: ["test/**/*.contract.test.ts"],
    environment: "node",
  },
});
