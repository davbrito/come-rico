/// <reference types="@cloudflare/vitest-pool-workers" />

// Makes the `cloudflare:test` module and the test `env` (typed from the
// Worker's bindings) available to the test suite.
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}
