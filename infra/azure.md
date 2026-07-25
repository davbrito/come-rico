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

No Terraform/Pulumi/SST here on purpose: this is one resource group, one
plan, one web app, created once. The commands below *are* the
infrastructure. (If reproducibility ever matters, the `azurerm` Terraform
provider covers this in ~30 lines.)

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
RG=come-rico
APP=come-rico-api           # must be globally unique; this becomes <APP>.azurewebsites.net
LOCATION=eastus

az group create --name "$RG" --location "$LOCATION"

az appservice plan create \
  --name come-rico-plan --resource-group "$RG" \
  --sku F1 --is-linux

az webapp create \
  --name "$APP" --resource-group "$RG" \
  --plan come-rico-plan \
  --runtime "DOTNETCORE:9.0"
```

The app is published **self-contained** (it carries its own .NET 10
runtime), so the `--runtime` above is just the Linux host image — it does
not need to match .NET 10, which is still Preview-tagged on App Service in
some regions. Point the startup command at the published binary:

```bash
az webapp config set \
  --name "$APP" --resource-group "$RG" \
  --startup-file "./ComeRico.Api"
```

### App settings

Same environment variables the app already expects — nothing new:

```bash
az webapp config appsettings set \
  --name "$APP" --resource-group "$RG" \
  --settings \
    ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS="http://0.0.0.0:8080" \
    WEBSITES_PORT=8080 \
    ConnectionStrings__DefaultConnection="Host=...;Port=5432;Database=...;Username=...;Password=..." \
    R2__ServiceUrl="https://<account_id>.r2.cloudflarestorage.com" \
    R2__AccessKeyId="..." \
    R2__SecretAccessKey="..." \
    R2__BucketName="..." \
    R2__PublicBaseUrl="https://..." \
    CRON_SECRET="..."
```

> The connection string must be ADO.NET `keyword=value` format, not a
> `postgres://` URI — the app reads `ConnectionStrings:DefaultConnection`
> directly and does no URI parsing. Neon's dashboard can emit this format.

## Wiring it to Vercel

Two places reference the backend, because the frontend reaches it two
different ways (see `frontend/src/lib/api.ts`):

1. **`vercel.json`** — replace `REPLACE_WITH_AZURE_APP_NAME` in the
   `/api/(.*)` rewrite with your `$APP` name. This is the browser's path.
2. **`BACKEND_URL`** env var in Vercel project settings →
   `https://<APP>.azurewebsites.net`. This is the SSR path — TanStack
   Start's server calls the backend directly during `beforeLoad`.

Both must be set, or auth will work in the browser but not on first paint
(or vice versa).

## CI/CD

`.github/workflows/deploy-backend.yml` deploys on pushes to `main` that
touch `backend/**`, plus manual dispatch. Configure once:

```bash
az webapp deployment list-publishing-profiles \
  --name "$APP" --resource-group "$RG" --xml
```

- Paste that XML into the repo secret **`AZURE_WEBAPP_PUBLISH_PROFILE`**
- Set the repo variable **`AZURE_WEBAPP_NAME`** to `$APP`

Both under the `Production` GitHub Environment, matching the existing
`migrate-database.yml` convention.

Database migrations are unchanged — still `migrate-database.yml`
(`dotnet ef database update`) run manually against Neon.

## Keep it warm

F1 has no "Always On", so the app sleeps after 20 minutes idle and the next
visitor waits ~20–40s. Point a free uptime monitor
([UptimeRobot](https://uptimerobot.com) free tier does 5-minute checks) at:

```
https://<APP>.azurewebsites.net/api/auth/me
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
