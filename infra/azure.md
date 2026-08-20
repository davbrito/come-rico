# Backend hosting — Azure App Service (free tier)

The frontend stays on Vercel. Only the .NET backend runs on Azure.

```
browser ──► Vercel (frontend SSR + /api/* rewrite) ──► Azure App Service (.NET API)
                                                              │
                                              Neon (Postgres) ─┴─ Cloudflare R2 (images)
```

The browser only ever talks to the Vercel origin — `vercel.json` rewrites
`/api/*` to Azure server-side. That keeps the `__Host-` auth cookie
same-origin, so there's no CORS config and no `SameSite=None` needed.

Infrastructure is managed with Terraform — see [`infra/terraform/`](terraform/README.md).
It provisions the `azurerm` stack (resource group, App Service Plan, Linux
Web App), the Neon Postgres project/branch, and the Cloudflare R2 bucket,
all named per the [Azure CAF convention](terraform/README.md#naming) and
templated by `environment` so a second environment is just a different
`terraform.tfvars`. The sections below describe what it provisions and how
to wire it up; use `terraform apply` instead of the raw `az`/dashboard
steps they used to show.

## Cost

Everything stays on free tiers: App Service **F1** ($0, doesn't expire),
Neon free, Cloudflare R2 free, Vercel Hobby.

F1's limits are real, so know them going in:

| Limit | Value |
|---|---|
| Compute | 60 CPU-minutes/day (ample for a household app) |
| Memory | 1 GB |
| Idle | App sleeps after 20 min → ~20–40s cold start |
| Custom domain SSL | Not supported on F1 |

The idle sleep is the only one you'll actually feel — see
[Keep it warm](#keep-it-warm).

Upgrading is one flag if you outgrow it:
`az appservice plan update --sku B1` (~$13/mo, removes all four limits).

## One-time setup

```bash
az login

cd infra/terraform
terraform init
cp terraform.tfvars.example terraform.tfvars   # fill in real secrets
terraform apply
```

This creates, all named `<type>-come-rico-prod[-eus]` (see
[naming](terraform/README.md#naming)):

- Resource group, App Service Plan (F1, Linux), and the Linux Web App —
  startup command points at the published self-contained binary
  (`./ComeRico.Api`, carries its own .NET 10 runtime, so the plan's host
  image doesn't need to match)
- A Neon project + branch + database + role for `prod`
- A Cloudflare R2 bucket for images

...and wires the Neon connection string + R2 bucket name straight into the
web app's settings in one pass. See [`infra/terraform/README.md`](terraform/README.md)
for details and what's intentionally left out of Terraform (R2 access
keys, CI secrets, migrations).

### App settings

Set via `app_settings` in `infra/terraform/main.tf`, sourced from Terraform
resources/variables — nothing to run by hand:

```
ASPNETCORE_ENVIRONMENT               = "Production"
ASPNETCORE_URLS                      = "http://0.0.0.0:8080"
WEBSITES_PORT                        = "8080"
ConnectionStrings__DefaultConnection = local.database_connection_string   # built from the Neon resources
R2__ServiceUrl                       = local.r2_service_url               # <account_id>.r2.cloudflarestorage.com
R2__AccessKeyId                      = var.r2_access_key_id
R2__SecretAccessKey                  = var.r2_secret_access_key
R2__BucketName                       = cloudflare_r2_bucket.images.name
R2__PublicBaseUrl                    = local.r2_public_base_url                     # https://storage-<environment>.<base_domain>
CRON_SECRET                          = var.cron_secret
```

> The Neon connection string is assembled in ADO.NET `keyword=value`
> format, not a `postgres://` URI — the app reads
> `ConnectionStrings:DefaultConnection` directly and does no URI parsing.

## Wiring it to Vercel

Two places reference the backend, because the frontend reaches it two
different ways (see `frontend/src/lib/api.ts`):

1. **`vercel.json`** — replace `REPLACE_WITH_AZURE_APP_NAME` in the
   `/api/(.*)` rewrite with the `app_name` output (e.g.
   `app-come-rico-prod-ab12`). This is the browser's path.
2. **`BACKEND_URL`** env var in Vercel project settings → the
   `app_hostname` output (`https://<app_name>.azurewebsites.net`). This is
   the SSR path — TanStack Start's server calls the backend directly
   during `beforeLoad`.

Both must be set, or auth will work in the browser but not on first paint
(or vice versa).

## CI/CD

`.github/workflows/deploy-backend.yml` deploys on pushes to `main` that
touch `backend/**`, plus manual dispatch. Configure once:

```bash
az webapp deployment list-publishing-profiles \
  --name "$(terraform -chdir=infra/terraform output -raw app_name)" \
  --resource-group "$(terraform -chdir=infra/terraform output -raw resource_group_name)" \
  --xml
```

- Paste that XML into the repo secret **`AZURE_WEBAPP_PUBLISH_PROFILE`**
- Set the repo variable **`AZURE_WEBAPP_NAME`** to the `app_name` output

Both under the `Production` GitHub Environment, matching the existing
`migrate-database.yml` convention.

Database migrations are unchanged — still `migrate-database.yml`
(`dotnet ef database update`) run manually against Neon.

## Keep it warm

F1 has no "Always On", so the app sleeps after 20 minutes idle and the next
visitor waits ~20–40s. Point a free uptime monitor
([UptimeRobot](https://uptimerobot.com) free tier does 5-minute checks) at:

```
https://<app_hostname output>/api/auth/me
```

It returns 401 unauthenticated, which is fine — it only needs to wake the
app. At ~5-minute intervals this costs a negligible slice of the 60
CPU-min/day budget and removes cold starts entirely.

> Don't use a GitHub Actions scheduled workflow for this on a private repo —
> a 10-minute cron burns ~4,300 billed minutes/month against a 2,000-minute
> free allowance. An external pinger is free either way.

## Notes

- App Service terminates TLS and forwards `X-Forwarded-Proto`. The auth
  cookie uses `CookieSecurePolicy.Always` in production, which sets the
  `Secure` flag unconditionally, so this works without
  `UseForwardedHeaders`. Add that middleware if you ever need
  `Request.IsHttps` to be accurate in app code.
- Secrets live in App Service application settings. Azure Key Vault
  references are available if you outgrow that.
