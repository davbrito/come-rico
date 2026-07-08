import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// Runs tests inside workerd (the same runtime as production) via
// @cloudflare/vitest-pool-workers, so bindings behave as they do when deployed.
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});
