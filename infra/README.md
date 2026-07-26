# Infrastructure

Terraform, in this directory.

```
browser ──► Cloudflare Worker (TanStack Start SSR + /api/** proxy)
                   │                        │
             R2 (images)      Azure App Service F1 (.NET API) ──► Neon (Postgres)
```

The Worker is the only public origin. `/api/**` is reverse-proxied to Azure
by [`frontend/src/routes/api.$.ts`](../frontend/src/routes/api.$.ts), which
keeps the `__Host-` auth cookie same-origin — no CORS, no `SameSite=None`,
and `BACKEND_URL` is the single source of truth for where the backend lives.

| File | Contents |
|---|---|
| `cloudflare.tf` | R2 bucket |
| `azure.tf` | Resource group, App Service plan (F1), Linux web app |
| `neon.tf` | Neon project + the assembled connection string |
| `versions.tf` | Providers and the R2-backed state config |

## Cost

Everything is on a free tier, which is a hard requirement for this project:

| Piece | Free allowance |
|---|---|
| Cloudflare Workers | 100k requests/day (counts static assets and proxied `/api` calls too) |
| Cloudflare R2 | 10 GB storage — also holds Terraform state |
| Neon | 1 project, scale-to-zero compute |
| Azure App Service **F1** | $0, doesn't expire — 60 CPU-min/day, 1 GB RAM, no custom-domain SSL |

F1 has no "Always On" and unloads after ~20 min idle, which would cost the
next visitor a 20–40s cold start. A Worker cron (declared in
[`frontend/wrangler.jsonc`](../frontend/wrangler.jsonc)) pings it every 5
minutes — that's what makes the free tier usable rather than something
users feel. `az appservice plan update --sku B1` (~$13/mo) lifts F1's limits
if you outgrow them.

## What Terraform does and doesn't own

**Terraform owns infrastructure. Each platform's native CLI ships
application code.** That split isn't arbitrary — neither provider has a
first-class "deploy this build output" resource:

- **Terraform**: R2 bucket, Neon project, all Azure resources (including
  the web app's *configuration* and app settings).
- **wrangler**: the Worker. The Cloudflare provider ≥ 5.11 can upload
  static assets, but `content` takes a *single* file and this build emits
  **48 ES modules** plus an assets directory. Wrangler handles multi-module
  uploads natively, and the Vite plugin already emits a correct config at
  `dist/server/wrangler.json` — including the cron triggers declared in
  `frontend/wrangler.jsonc`. `BACKEND_URL` is passed at deploy time from a
  Terraform output, so the Worker always points at the App Service
  Terraform just reconciled.
- **`az webapp deploy`**: the backend binary.

**Caveat**: the Neon provider (`kislerdm/neon`) is community-maintained and
not officially supported by Neon. Nothing at runtime depends on it — worst
case, manage Neon from the console and pass the connection string in as a
variable instead.

## State

State lives in R2 via Terraform's S3 backend (R2 is S3-compatible), so
there's no AWS account and no extra cost. Create the bucket once:

```bash
# Cloudflare dashboard → R2 → Create bucket, e.g. "come-rico-tfstate"
```

Then initialise. The `AWS_*` variables are what the S3 backend expects —
they're **R2** credentials, not AWS ones:

```bash
cd infra
export AWS_ACCESS_KEY_ID=<r2-access-key-id>
export AWS_SECRET_ACCESS_KEY=<r2-secret-access-key>

terraform init \
  -backend-config="bucket=come-rico-tfstate" \
  -backend-config="endpoints={s3=\"https://<account-id>.r2.cloudflarestorage.com\"}"
```

## Deploying

CI does all of this on every push to `main` — see
`.github/workflows/deploy.yml`. By hand:

```bash
# 1. Infrastructure
cd infra && terraform apply

# 2. Worker (build first — wrangler deploys dist/, not source)
cd ../frontend
pnpm install && pnpm build
pnpm exec wrangler deploy --config dist/server/wrangler.json \
  --var "BACKEND_URL:$(cd ../infra && terraform output -raw backend_url)"
printf '%s' "$CRON_SECRET" | pnpm exec wrangler secret put CRON_SECRET \
  --config dist/server/wrangler.json
```

Then ship the backend binary:

```bash
cd ../backend
dotnet publish ComeRico.Api/ComeRico.Api.csproj -c Release -r linux-x64 \
  --self-contained true -o publish
(cd publish && zip -qr ../backend.zip . -x '*.pdb')
az webapp deploy --resource-group "$(cd ../infra && terraform output -raw backend_resource_group)" \
  --name "$(cd ../infra && terraform output -raw backend_app_name)" \
  --src-path backend.zip --type zip
```

### Variables

Supply via `terraform.tfvars` (gitignored) or `TF_VAR_*`:

`cloudflare_api_token`, `cloudflare_account_id`, `azure_subscription_id`,
`neon_api_key`, `cron_secret`, `r2_access_key_id`, `r2_secret_access_key`,
`r2_public_base_url`.

Azure provider auth additionally reads `ARM_CLIENT_ID`, `ARM_CLIENT_SECRET`,
`ARM_TENANT_ID` from the environment.

### Required repository secrets

`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `TF_STATE_BUCKET`,
`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`,
`AZURE_SUBSCRIPTION_ID`, `AZURE_CREDENTIALS` (for `azure/login`),
`NEON_API_KEY`, `CRON_SECRET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_PUBLIC_BASE_URL`.

## R2 bucket setup (manual, once)

Two things the app depends on that aren't expressed in Terraform — verify
in the dashboard after the first apply:

- **Public read access** on the images bucket, so `r2_public_base_url`
  resolves (r2.dev subdomain or a custom domain).
- **A CORS rule allowing POST.** The browser uploads directly to R2 via
  presigned POST (see the upload ticket flow in [`AGENTS.md`](../AGENTS.md)).
  Without it uploads fail while everything else looks healthy.

`r2_access_key_id` / `r2_secret_access_key` are **S3-compatible R2 API
tokens** (R2 → Manage API tokens). The backend talks to R2 through
`AmazonS3Client` with explicit credentials, not a Worker binding, so these
are needed even though Terraform creates the bucket. The same pair is
reused for the Terraform state backend.

## Database migrations

Unchanged and deliberately outside Terraform —
`.github/workflows/migrate-database.yml` runs `dotnet ef database update`
manually against Neon. The app never migrates itself at startup.

The connection string is assembled in `neon.tf` in ADO.NET
`keyword=value` form. The backend reads `ConnectionStrings:DefaultConnection`
and does **no** URI parsing, so a raw `postgres://` URL will not work.

## Migrating data onto this stack

The Neon project and R2 bucket here are **new**. To carry over existing
data see [`docs/migration.md`](../docs/migration.md) — in particular the
`Dish.ImageUrl` rewrite, which is easy to miss and silently breaks every
dish image.
