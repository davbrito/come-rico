// Secrets are not part of wrangler.jsonc, so `wrangler types` can't see them.
// Augment the generated global `Env` with the secret bindings the Worker reads.
declare global {
  interface Env {
    /** Better Auth signing secret. `wrangler secret put BETTER_AUTH_SECRET` (prod) / .dev.vars (local). */
    BETTER_AUTH_SECRET: string;
  }
}

export {};
