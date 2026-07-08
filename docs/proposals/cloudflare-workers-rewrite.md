# Proposal: Rewrite the ComeRico Backend on Cloudflare Workers

- **Status:** Draft — for discussion
- **Author:** drafted with Claude
- **Date:** 2026-07-08

## Summary

Replace the ASP.NET Core 10 backend (`backend/`) with a TypeScript backend running on Cloudflare Workers. The rewrite keeps the same HTTP API surface and domain rules (the frontend should need no functional changes beyond configuration), swaps SignalR for Durable Objects WebSockets, uses native R2 bindings instead of the S3 SDK, and consolidates the whole stack on one language (TypeScript) and — optionally — one platform (Cloudflare).

## Motivation

1. **One language across the stack.** Today the project is TypeScript (frontend) + C# (backend). A Workers backend makes the monorepo a single-language pnpm workspace: shared types between API and frontend, one toolchain, one lint/test setup, and simpler contribution for anyone working on the frontend.
2. **Operational fit for a small household app.** The backend is a low-traffic CRUD API with one real-time feature. Workers' scale-to-zero pricing and zero server management fit this profile better than a container that must run (and cold-start .NET) on Vercel.
3. **We already depend on Cloudflare.** Image uploads go to Cloudflare R2 via the AWS S3 SDK with R2-specific workarounds (checksum `WHEN_REQUIRED`, presigned-POST CORS setup). On Workers, R2 is a native binding — no S3 client, no credentials in config, no signature quirks.
4. **Real-time without sticky infrastructure.** SignalR needs a backplane (e.g. Redis) the moment the container scales past one instance. A Durable Object per household gives us exactly the `household-{id}` group semantics we have today, with WebSocket Hibernation so idle sockets cost nothing.
5. **Cold starts.** Workers cold starts are single-digit milliseconds; a .NET container on serverless infra is orders of magnitude slower and the earlier Native AOT attempt was reverted (`3afaf1e`).

### Why *not* rewrite (counterpoints, stated honestly)

- The current backend **works** and is well-structured (Minimal APIs, MediatR, tenant query filters). A rewrite trades a known-good system for regression risk with no new user-facing features.
- EF Core's global query filters give *automatic* household isolation. No TypeScript ORM has an equivalent; tenant scoping becomes a discipline enforced by code review and helpers, not the type system alone. This is the single biggest safety regression and is addressed in [Multi-tenancy](#multi-tenancy-household-isolation) below.
- ASP.NET Identity handles password hashing, lockout, stamping, and token providers for free. We'd re-adopt this via a maintained auth library (Better Auth), not hand-rolled crypto.

If the team weighs these higher than the motivations, the alternative is to keep .NET and only move *hosting* (e.g. to a container platform with fewer cold-start issues). This proposal assumes we want the full rewrite.

## Current state (what must be preserved)

| Concern | Today |
|---|---|
| API | ASP.NET Core 10 Minimal APIs, ~8 endpoint groups (auth, households, dishes, tags, meal plans, shopping, roulette, images) |
| Business logic | MediatR handlers in `ComeRico.Core/Features/**` (~28 commands/queries) with FluentValidation + admin-only pipeline behaviors |
| Data | PostgreSQL via EF Core + Npgsql; `DATABASE_URL` (Neon-style) preferred |
| Auth | ASP.NET Identity, cookie session `comerico.auth` (HttpOnly, SameSite=Lax), BFF pattern — no tokens in browser JS; claims carry `household_id`, `household_role`, `display_name` |
| Multi-tenancy | Global query filters on every `IHasHousehold` entity, tenant id read from the validated cookie claim |
| Real-time | SignalR `RouletteHub`, socket joined to `household-{id}` group; spins broadcast via `IHubContext` |
| Uploads | Presigned POST tickets to R2 (`StoredFile` Pending → Active → Orphaned lifecycle), 5 MB / image-type limits enforced in the signed policy |
| Cron | Vercel Cron hits `GET /api/images/cleanup` weekly with `Bearer {CRON_SECRET}` |
| Routing | Vercel rewrites: `/api/*` and `/hubs/*` → backend service, everything else → frontend |

Domain rules that must survive verbatim: roulette excludes winners from the last 3 days unless nothing else remains; shopping-list generation consolidates the Monday-based week's ingredients case-insensitively by name + unit and replaces only auto-generated items; ingredient amounts use the closed `MeasurementUnit` enum; enums serialize as string literals; invite-code join/rotate and fallback-admin household membership rules.

## Proposed architecture

### Stack

| Layer | Choice | Replaces |
|---|---|---|
| Runtime | Cloudflare Workers (workerd) | ASP.NET Core container |
| HTTP framework | [Hono](https://hono.dev) | Minimal APIs |
| Validation | Zod (via `@hono/zod-validator`) + generated OpenAPI | FluentValidation + built-in OpenAPI |
| ORM | Drizzle ORM (`postgres-js` driver) | EF Core + Npgsql |
| Database | Keep PostgreSQL (Neon), accessed through **Cloudflare Hyperdrive** for connection pooling | same DB, no migration of data |
| Auth | [Better Auth](https://better-auth.com) — cookie sessions, Postgres-backed, scrypt/argon2 hashing | ASP.NET Identity + Data Protection |
| Real-time | One **Durable Object** per household (`RouletteRoom`), WebSocket Hibernation API | SignalR + `IHubContext` |
| File storage | Native **R2 binding**; keep the presigned-POST ticket flow | `AmazonS3Client` against R2 |
| Cron | Workers **Cron Triggers** (`scheduled` handler) | Vercel Cron + `CRON_SECRET` endpoint |
| Migrations | `drizzle-kit` SQL migrations, applied via CI | `dotnet ef` |
| Tests | Vitest + `@cloudflare/vitest-pool-workers` (runs tests inside workerd) | xUnit |

### Repository shape

```text
come-rico/
├── backend/            # replaced: Cloudflare Worker (TypeScript)
│   ├── wrangler.jsonc  # bindings: HYPERDRIVE, R2 bucket, RouletteRoom DO, cron
│   ├── src/
│   │   ├── index.ts            # Hono app + scheduled() handler
│   │   ├── db/schema.ts        # Drizzle schema (mirrors current EF model)
│   │   ├── db/tenant.ts        # tenant-scoped query helpers (see below)
│   │   ├── auth/               # Better Auth config + session middleware
│   │   ├── routes/             # auth, households, dishes, tags, meal-plans,
│   │   │                       # shopping, roulette, images
│   │   ├── features/           # pure business logic, mirrors Core/Features/**
│   │   └── realtime/roulette-room.ts   # Durable Object
│   └── test/
├── frontend/           # unchanged
└── packages/shared/    # optional: zod schemas / API types shared with frontend
```

The MediatR layering maps to plain functions: each `features/**` module exports a function taking `(deps, input)` where `deps` carries the tenant-scoped DB handle. Route files stay thin (parse → validate → call feature → serialize), preserving today's "endpoints map HTTP to handlers" rule. Cross-cutting behaviors (validation, admin-only) become Hono middleware instead of MediatR pipeline behaviors.

### Multi-tenancy (household isolation)

This is the highest-risk area. EF's global query filters are replaced by a **mandatory scoped repository**, not by remembering `WHERE household_id = ?`:

- `db/tenant.ts` exports `tenantDb(db, householdId)` returning an object whose query builders for every household-scoped table (dishes, roulette_sessions, ingredients, tags, meal_plans, shopping_items, stored_files) *always* inject the `householdId` predicate on select/update/delete and stamp it on insert.
- Feature functions receive **only** the tenant-scoped handle; the raw `db` is constructed in `index.ts` and passed unscoped only to auth, household-membership, and the cron cleanup (the one legitimate cross-tenant path today, mirroring `IgnoreQueryFilters`).
- An ESLint rule (`no-restricted-imports`) blocks importing the raw client inside `features/**`.
- Contract tests: for every feature, a two-household fixture asserts no cross-tenant reads/writes. These tests are the acceptance gate for the rewrite.

`RequiresHousehold` becomes middleware that 403s when the session has no `householdId`, same as today.

### Auth

- Better Auth with email/password, session cookie `comerico.auth` (HttpOnly, SameSite=Lax, `Secure` always in production — fixing a known issue from AGENTS.md §5).
- Sessions are DB rows referencing the user; `household_id` / `role` / `display_name` live on the user row and are read per-request, which **removes** the current "stale claims until `RefreshSignInAsync`" dance — create/join household is immediately visible without re-issuing the cookie.
- No Data Protection key ring needed at all (another AGENTS.md pain point — the `DataProtectionKeys` table and its container-restart bug disappear).
- BFF pattern is unchanged: same-origin `/api` proxying, cookie never exposed to JS.
- CSRF: keep SameSite=Lax and add the origin-check middleware Better Auth ships (defense-in-depth item from AGENTS.md §5, essentially free here).

### Real-time roulette (Durable Objects)

- `RouletteRoom` Durable Object, id derived from `householdId` (`idFromName`). The Worker authenticates the WebSocket upgrade at `/hubs/roulette` from the session cookie — the client never supplies the household id, matching today's rule — then forwards the socket into the DO.
- WebSocket Hibernation keeps idle rooms free; connected members receive `spinStarted` / `winnerSelected` events.
- The spin itself stays a normal feature function hit via REST (as today, where the endpoint runs the MediatR command then broadcasts): the route runs the spin against Postgres, then calls `RouletteRoom.broadcast()` via RPC. The DO holds **no authoritative state** — Postgres remains the source of truth, so a DO eviction loses nothing.
- Frontend change: replace `@microsoft/signalr` (`src/lib/signalr.ts`) with a plain `WebSocket` + a ~50-line reconnect/JSON-envelope helper. This is the only substantive frontend code change in the rewrite.

### Images / R2

- Same ticket flow and `StoredFile` lifecycle. Two options:
  - **A (recommended): direct upload through the Worker.** `POST /api/images/{uploadId}` streams the body straight into the R2 binding (`env.BUCKET.put`) with size/content-type enforcement in code. Workers accept request bodies well above our 5 MB cap, upload traffic doesn't touch Postgres, and we delete the presigned-POST machinery *and* the bucket CORS configuration entirely.
  - B: keep presigned POST using `aws4fetch` — preserves "no upload bytes through the API" but keeps signature/CORS complexity that option A exists to remove.
- Orphan GC moves from a Bearer-protected public endpoint to the Worker's `scheduled()` handler (`0 0 * * 0`). `CRON_SECRET` and the public cleanup URL are deleted — the endpoint's only consumer was the cron.

### Database

- **Keep the existing PostgreSQL data.** The Drizzle schema is written to match the current EF snapshot (table/column names verbatim), validated by `drizzle-kit pull` against a copy of production. No data migration; Identity's `AspNetUsers` password hashes are the one exception — see cutover step 4.
- Hyperdrive fronts the connection (Workers are short-lived; unpooled Postgres connections would exhaust Neon).
- Migration policy carries over: migrations run only via `drizzle-kit`/CI, never at startup.

## Deployment & routing

Two viable end states:

1. **Minimal move (recommended first step):** frontend stays on Vercel; `vercel.json` rewrites for `/api/*` and `/hubs/*` point at the Worker's custom domain instead of the backend service. One caveat to verify early: Vercel rewrites and WebSocket upgrades — if proxied upgrades are unreliable, serve the Worker on `api.<domain>` and have the frontend open the WebSocket cross-origin (cookie needs `SameSite=None; Secure` for that host, or a short-lived socket token minted by `/api`).
2. **Full Cloudflare:** move the TanStack Start frontend to Workers static assets/SSR later, making routing trivially same-origin again. Out of scope for this proposal but kept open by choice 1.

## Migration plan

Phased, with the .NET backend running until parity is proven:

1. **Scaffold + read-only parity (week 1–2).** Worker with Hyperdrive against a staging copy of the DB; Drizzle schema validated against the EF snapshot; implement `GET` endpoints; contract-test both backends return identical JSON (enum-as-string included) using the existing OpenAPI spec as the oracle.
2. **Auth + writes (week 2–4).** Better Auth tables added via migration; all commands ported with the tenant-scoped handle; two-household isolation suite green; admin-only rules ported as middleware.
3. **Real-time + images + cron (week 4–5).** `RouletteRoom` DO, WebSocket helper in the frontend behind a flag; upload flow option A; `scheduled()` GC.
4. **Password cutover.** Better Auth can't read ASP.NET Identity's PBKDF2 format directly, so ship a custom `password.verify` that recognizes the Identity hash format and transparently re-hashes on first successful login. No forced resets. (This app has a handful of household users — worst case, a manual reset is acceptable, but the shim is cheap.)
5. **Cutover (week 5–6).** Point staging rewrites at the Worker; run both against production DB briefly (Worker primary, .NET as instant rollback since the schema is unchanged); flip production; watch for a week; then delete `backend/` .NET code, `Dockerfile.vercel`, cron config, and R2 CORS rules, and update README/AGENTS.md.

Rollback at any point = flip the rewrites back; the shared, unchanged schema makes this safe (the only additive tables are Better Auth's, which .NET ignores).

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Tenant-isolation regression (losing EF global filters) | **High** | Scoped-handle design, lint rule, mandatory two-household contract tests as the acceptance gate |
| Password hash migration | Medium | Verify-and-rehash shim; tiny user base bounds the blast radius |
| Vercel rewrite of WebSocket upgrades | Medium | Spike in week 1; fallback is the `api.` subdomain path |
| Subtle domain-rule drift (roulette 3-day rule, week consolidation) | Medium | Port rules with side-by-side unit tests derived from the C# handlers before deleting them |
| Neon connection behavior under Workers | Low | Hyperdrive is built for exactly this; validated in staging |
| CPU limits (Workers ~30 s CPU on paid plan) | Low | All operations are short CRUD/broadcast; nothing long-running exists today |

## Cost sketch

Workers Paid plan ($5/mo) covers Workers, Durable Objects (hibernated sockets bill ~nothing while idle), Cron Triggers, and Hyperdrive; R2 is already paid for. This replaces the Vercel backend-container compute. Neon stays as-is.

## Open questions

1. Deployment end state: stop at "backend on Workers, frontend on Vercel," or plan the full Cloudflare move?
2. Uploads: confirm option A (through-Worker upload) vs. keeping presigned POST.
3. Better Auth vs. hand-rolled sessions (Hono middleware + scrypt): Better Auth recommended for lockout/rate-limit/token plumbing, but it does own its table shapes.
4. Is there appetite to migrate Postgres → D1 later? (Not recommended now: relational features, existing data, and Drizzle keep Postgres cheap to keep.)
