import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { configDefaults } from "vitest/config";

// Runs tests inside workerd (the same runtime as production) via
// @cloudflare/vitest-pool-workers, so bindings behave as they do when deployed.
// Contract tests (*.contract.test.ts) need an embedded Postgres, which workerd
// can't run — they run in the Node project (vitest.node.config.ts) instead.
export default defineWorkersConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "test/**/*.contract.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Secrets aren't in wrangler.jsonc; provide a dummy for tests that
          // construct the auth instance (no real signing needed in unit tests).
          bindings: { BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789abcdef" },
        },
      },
    },
  },
});
