# ComeRico API — Cloudflare Workers

TypeScript rewrite of the ComeRico backend, running on Cloudflare Workers.
See [`../docs/proposals/cloudflare-workers-rewrite.md`](../docs/proposals/cloudflare-workers-rewrite.md)
for the design and migration plan.

> Built alongside the existing .NET backend (`../backend/`) until parity is
> reached; the .NET code is deleted at cutover.

## Stack

| Concern | Choice |
|---|---|
| Runtime | Cloudflare Workers (workerd) |
| HTTP | Hono |
| DB | PostgreSQL (Neon) via Cloudflare Hyperdrive |
| ORM | Drizzle *(added in a later step)* |
| Auth | Better Auth *(added in a later step)* |
| Real-time | `RouletteRoom` Durable Object (one per household) |
| Storage | R2 (native binding) |
| Cron | Workers Cron Trigger (weekly orphan-image GC) |
| Tests | Vitest via `@cloudflare/vitest-pool-workers` (runs in workerd) |

## Develop

```bash
pnpm install
pnpm dev          # wrangler dev
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest (inside workerd)
pnpm cf-typegen   # regenerate worker-configuration.d.ts after editing wrangler.jsonc
```

`worker-configuration.d.ts` is generated (git-ignored); run `pnpm cf-typegen`
after cloning or after any `wrangler.jsonc` binding change.

## Provisioning (before first deploy)

The resource ids in `wrangler.jsonc` are **placeholders**. Create the real
resources and paste their ids in:

```bash
# Hyperdrive in front of the Neon Postgres URL
wrangler hyperdrive create comerico-db --connection-string "postgresql://USER:PASS@HOST/DB?sslmode=require"
#   → paste the returned id into hyperdrive[0].id

# R2 buckets (prod + preview)
wrangler r2 bucket create comerico-images
wrangler r2 bucket create comerico-images-preview
```

- `IMAGE_PUBLIC_BASE_URL` (in `vars`): the bucket's public r2.dev subdomain or
  custom domain.
- Secrets are set with `wrangler secret put NAME`, not committed here:
  - `BETTER_AUTH_SECRET` — Better Auth signing secret (`openssl rand -base64 32`).
- `ENVIRONMENT` (`development` | `production`) drives secure-cookie enforcement;
  `AUTH_BASE_URL` is the API's public origin (Better Auth cookie/URL config).

### Local dev

- **Hyperdrive** uses `hyperdrive[0].localConnectionString` (defaults to a local
  Postgres at `localhost:5432/comerico`). Override with
  `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.
- **R2** and **Durable Objects** are emulated locally by `wrangler dev` — no
  cloud resources needed.

## Bindings

| Binding | Type | Purpose |
|---|---|---|
| `HYPERDRIVE` | Hyperdrive | Pooled Postgres connection string |
| `BUCKET` | R2 | Dish images |
| `ROULETTE_ROOM` | Durable Object | Per-household real-time roulette |
| `IMAGE_PUBLIC_BASE_URL` | var | Public base URL for served images |

Cron: `0 0 * * 0` (weekly) → `scheduled()` orphan-image sweep.
