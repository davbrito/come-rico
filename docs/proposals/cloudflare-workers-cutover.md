# Cutover checklist — .NET → Cloudflare Workers backend

Companion to [`cloudflare-workers-rewrite.md`](./cloudflare-workers-rewrite.md).
The Worker backend lives in [`../../backend-workers/`](../../backend-workers/)
and runs **in parallel** with the .NET backend (`../../backend/`) until the
steps below are done. Nothing here deletes the .NET backend or flips production
routing until parity is verified.

## Status

Implemented and green (typecheck + lint + 38 tests across the workerd and Node
projects):

- Hono app, all REST endpoints (auth, households, dishes, tags, meal plans,
  shopping, roulette, images), Better Auth cookie sessions, tenant-scoped DB
  handle + isolation contract suite, RouletteRoom Durable Object + `/hubs/
  roulette` WebSocket, R2 direct upload, weekly cron GC.
- Frontend: SignalR client replaced by a plain WebSocket; image upload
  unchanged (already PUTs to `uploadUrl`).

## Before flipping production

1. **Provision Cloudflare resources** and paste real ids into
   `backend-workers/wrangler.jsonc` (see `backend-workers/README.md`):
   Hyperdrive (in front of the Neon URL), R2 buckets, and set the
   `BETTER_AUTH_SECRET` secret + `IMAGE_PUBLIC_BASE_URL` / `AUTH_BASE_URL` vars.
2. **Create the schema** on the target database: `pnpm db:migrate` (pre-
   production, so a drop/recreate is fine).
3. **Frontend API client — already repointed.** The Worker generates its own
   OpenAPI document dynamically with `@hono/zod-openapi` (served at
   `/openapi/v1.json`; snapshotted to
   [`../../backend-workers/openapi.json`](../../backend-workers/openapi.json)
   via `pnpm openapi:snapshot`). `frontend/openapi-ts.config.ts` now reads that
   snapshot, and `frontend/src/api` (git-ignored) has been regenerated from it —
   operationIds were preserved, so the client's method names are unchanged
   (two obsolete .NET params — logout's empty body and login's `useCookies`
   query — were dropped, a two-line frontend fix). The generated client targets
   the same paths/DTOs, so it works against either backend during the parallel
   period. Re-run `pnpm openapi:snapshot` (backend) + `pnpm openapi:generate`
   (frontend) whenever a route or schema changes.
4. **Deploy the Worker** (`wrangler deploy`) to a staging URL and verify end to
   end against a copy of the app: register/login, household create/join,
   dishes + image upload, meal plans, shopping generate, roulette spin with two
   browsers watching the WebSocket.
5. **Spike the WebSocket path through Vercel.** If Vercel's rewrite of the
   `/hubs/*` upgrade is unreliable, serve the Worker on `api.<domain>` and open
   the socket cross-origin (cookie then needs `SameSite=None; Secure`, or a
   short-lived socket token minted by `/api`).

## Flip production

Point `vercel.json` rewrites at the Worker instead of the `backend` service:

```jsonc
// vercel.json — replace the backend service rewrites with the Worker origin
"rewrites": [
  { "source": "/api/(.*)",  "destination": "https://comerico-api.<subdomain>.workers.dev/api/$1" },
  { "source": "/hubs/(.*)", "destination": "https://comerico-api.<subdomain>.workers.dev/hubs/$1" },
  { "source": "/(.*)",      "destination": { "service": "frontend" } }
]
```

(Or drop the `backend` service entirely once the Worker is authoritative.)

## After parity is confirmed

- Delete `backend/` (.NET), `backend/Dockerfile.vercel`, and the Vercel `crons`
  entry in `vercel.json` (the Worker's cron trigger replaces it).
- Delete the R2 bucket CORS rule (direct-upload Option A doesn't need it) and
  the `CRON_SECRET` (the cleanup endpoint is gone).
- Rename `backend-workers/` → `backend/`.
- Update `README.md` and `AGENTS.md` to the new stack (tech table, run/build/
  test commands, migrations via `drizzle-kit`).
