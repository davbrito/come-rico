# Infrastructure

Everything is defined in [`sst.config.ts`](../sst.config.ts) at the repo root.

```
browser ──► Cloudflare Worker (TanStack Start SSR + /api/** proxy)
                   │                        │
             R2 (images)      Azure App Service F1 (.NET API) ──► Neon (Postgres)
```

The Worker is the only public origin. `/api/**` is reverse-proxied to Azure
by [`frontend/src/routes/api.$.ts`](../frontend/src/routes/api.$.ts), which
keeps the `__Host-` auth cookie same-origin — no CORS, no `SameSite=None`,
and `BACKEND_URL` is the single source of truth for where the backend lives.

## Cost

Everything is on a free tier, which is a hard requirement for this project:

| Piece | Free allowance |
|---|---|
| Cloudflare Workers | 100k requests/day (counts static assets and proxied `/api` calls too) |
| Cloudflare R2 | 10 GB storage |
| Neon | 1 project, scale-to-zero compute |
| Azure App Service **F1** | $0, doesn't expire — 60 CPU-min/day, 1 GB RAM, no custom-domain SSL |
| SST | Open source; state lives in R2 via `home: "cloudflare"` — no AWS account |

F1 sleeps after ~20 min idle, so the config runs a `KeepWarm` cron every 5
minutes in production. That's why cold starts aren't a problem here despite
the free tier. `az appservice plan update --sku B1` (~$13/mo) lifts F1's
limits if you outgrow them.

## Why SST doesn't own everything

- **Azure** — SST has no Azure components, so the App Service resources are
  raw Pulumi `azure-native` inside `run()`.
- **Neon** — uses a community provider (`kislerdm/neon`), not officially
  supported by Neon. Nothing at runtime depends on it; worst case is
  managing Neon from the console.
- **Backend binary** — SST creates the App Service, but `azure-native` has
  no first-class "ship this zip" resource, so `.github/workflows/deploy.yml`
  does an `az webapp deploy` after `sst deploy`.

## Secrets

Set once per stage. Values are stored by SST in Cloudflare (per `home`).

```bash
pnpm sst secret set CronSecret <value> --stage production
pnpm sst secret set CloudflareAccountId <value> --stage production
pnpm sst secret set R2AccessKeyId <value> --stage production
pnpm sst secret set R2SecretAccessKey <value> --stage production
pnpm sst secret set R2PublicBaseUrl <value> --stage production
```

`R2AccessKeyId` / `R2SecretAccessKey` are **S3-compatible R2 API tokens**
(created in the Cloudflare dashboard under R2 → Manage API tokens). The
backend talks to R2 through `AmazonS3Client` with explicit credentials, not
a Worker binding, so these are required even though SST creates the bucket.

`R2PublicBaseUrl` is the bucket's public r2.dev subdomain or custom domain.
The bucket must **allow public reads** and have a **CORS rule permitting
POST** — the browser uploads directly to R2 via presigned POST (see the
upload ticket flow in [`AGENTS.md`](../AGENTS.md)). Verify both in the
dashboard after the first deploy; without the CORS rule uploads fail while
everything else looks healthy.

## Deploying

```bash
pnpm install
pnpm sst deploy --stage production
```

CI does this on every push to `main` — see `.github/workflows/deploy.yml`.

### Required repository secrets

| Secret | Used for |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Workers, R2, SST state |
| `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | `azure-native` provider |
| `AZURE_CREDENTIALS` | `azure/login` for the backend zip deploy |
| `NEON_API_KEY` | Neon provider |

### Try it on a throwaway stage first

```bash
pnpm sst deploy --stage dev-yourname
```

Stages other than `production` are removable (`removal: "remove"`), so you
can tear one down with `pnpm sst remove --stage dev-yourname`. Production is
`retain` + `protect`, so SST refuses to delete its resources.

## Database migrations

Unchanged and deliberately outside SST — `.github/workflows/migrate-database.yml`
runs `dotnet ef database update` manually against Neon. The app never
migrates itself at startup.

The connection string is assembled in ADO.NET `keyword=value` form in
`sst.config.ts`. The backend reads `ConnectionStrings:DefaultConnection` and
does **no** URI parsing, so a raw `postgres://` URL will not work.

## Migrating data onto this stack

The Neon project and R2 bucket here are **new**. To carry over existing
data, see [`docs/migration.md`](../docs/migration.md) — in particular the
`Dish.ImageUrl` rewrite, which is easy to miss and silently breaks every
dish image.
