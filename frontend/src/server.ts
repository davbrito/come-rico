/**
 * Cloudflare Workers entry point.
 *
 * `main` in the wrangler config points here (see wrangler.jsonc, and the
 * config SST's TanStackStart component generates). TanStack Start's
 * default server entry is already a `{ fetch }` module object, which is
 * exactly the shape Workers expects, so it's re-exported as-is.
 *
 * It serves SSR routes plus the server routes under src/routes —
 * including the /api/** proxy in src/routes/api.$.ts.
 */
export { default } from "@tanstack/react-start/server-entry";
