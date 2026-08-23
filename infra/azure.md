# Backend hosting — Azure Container Apps

The frontend stays on Vercel. Only the .NET backend runs on Azure,
containerized.

```
browser ──► Vercel (frontend SSR + /api/* rewrite) ──► Azure Container Apps (.NET API)
                                                              │
                                              Neon (Postgres) ─┴─ Cloudflare R2 (images)
```

The browser only ever talks to the Vercel origin — `vercel.json` rewrites
`/api/*` to Azure server-side. That keeps the `__Host-` auth cookie
same-origin, so there's no CORS config and no `SameSite=None` needed.

Infrastructure is managed with Terraform — see [`infra/stack/`](stack/README.md).
It provisions the `azurerm` stack (resource group, Container Apps
Environment, Container App), the Neon Postgres project/branch, and the
Cloudflare R2 bucket, all named per the [Azure CAF
convention](stack/README.md#naming) and templated by `environment` so a
second environment is just a new `infra/live/<env>/terragrunt.hcl` (see
[`infra/README.md`](README.md)). The sections below describe what it
provisions and how to wire it up; use `terragrunt apply` instead of the
raw `az`/dashboard steps they used to show.

## Cost

Everything stays on free tiers: Container Apps' always-free monthly
allowance (180,000 vCPU-seconds, 360,000 GiB-seconds, 2 million requests —
shared across every Container App in the subscription), GitHub Container
Registry (free for a private repo's packages), Neon free, Cloudflare R2
free, Vercel Hobby.

Scale-to-zero is Container Apps' default (`min_replicas` unset), so an
idle app costs nothing beyond the free allowance either way. Cold starts
after idle aren't mitigated here — unlike the old App Service F1 setup,
there's no uptime-pinger requirement, since the point of moving here
wasn't to avoid them.

Upgrading compute per replica (`cpu`/`memory` in
`infra/stack/main.tf`'s `azurerm_container_app.api` block) or setting
`min_replicas > 0` are both one-line changes if you outgrow the free
allowance — deliberate, not automatic.

## One-time setup

See [`infra/README.md`](README.md) — provisioning goes through Terragrunt
(`cd infra/live/prod && terragrunt apply`), not `terraform` directly.

This creates, all named `<type>-come-rico-prod[-eus]` (see
[naming](stack/README.md#naming)):

- Resource group, Container Apps Environment, and the Container App —
  pulling its image from `ghcr.io/<owner>/come-rico-backend`, with
  `liveness_probe`/`readiness_probe` both pointed at `/health`
- A Neon project + branch + database + role for `prod`
- A Cloudflare R2 bucket for images

...and wires the Neon connection string + R2 bucket name straight into the
Container App's environment variables in one pass. See
[`infra/stack/README.md`](stack/README.md) for details and what's
intentionally left out of Terraform (GHCR image builds, CI secrets,
migrations).

### Environment variables

Set via `template.container.env` in `infra/stack/main.tf`, sourced from
Terraform resources/variables — nothing to run by hand:

```
ASPNETCORE_ENVIRONMENT                = "Production"
ASPNETCORE_URLS                       = "http://+:8080"
APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.api.connection_string
APPINSIGHTS_INSTRUMENTATIONKEY        = azurerm_application_insights.api.instrumentation_key
ConnectionStrings__DefaultConnection  = local.database_connection_string   # built from the Neon resources
R2__ServiceUrl                        = local.r2_service_url               # <account_id>.r2.cloudflarestorage.com
R2__AccessKeyId                       = local.r2_access_key_id             # generated Cloudflare API token, see stack/r2.tf
R2__SecretAccessKey                   = local.r2_secret_access_key
R2__BucketName                        = cloudflare_r2_bucket.images.name
R2__PublicBaseUrl                     = local.r2_public_base_url                     # https://storage-<environment>.<base_domain>
CRON_SECRET                           = random_password.cron_secret.result
```

> The Neon connection string is assembled in ADO.NET `keyword=value`
> format, not a `postgres://` URI — the app reads
> `ConnectionStrings:DefaultConnection` directly and does no URI parsing.

The Container App also needs a `ghcr-pat` secret (a GitHub PAT with
`read:packages` scope) to pull the image at runtime — GHCR pushes during
CI authenticate with the ephemeral `GITHUB_TOKEN`, but that token expires
with the workflow run, so a longer-lived credential is required for the
Container App itself. Terraform doesn't generate this one — create the
PAT by hand in GitHub and store it in Infisical under the `GHCR_PAT` key
(per-environment, see `infra/stack/infisical.tf`); `main.tf` reads it from
there, same as every other externally-issued token in this stack.

## Wiring it to Vercel

Two places reference the backend, because the frontend reaches it two
different ways (see `frontend/src/lib/api.ts`):

1. **`vercel.json`** — the `/api/(.*)` rewrite destination is actually
   Terraform-managed as of the Container Apps migration — see
   `infra/modules/vercel/vercel.tf`'s `vercel_project_route` resources.
   Unlike App Service's predictable `<name>.azurewebsites.net`, Container
   Apps ingress FQDNs carry an environment-generated unique label only
   known after the first `terragrunt apply` — so those two `dest` fields
   need a one-time hand-edit after provisioning (`terragrunt output
   app_hostname` in each environment), same as filling in any other
   post-apply value that can't be interpolated (the Vercel provider
   panics on an interpolated `dest`, see the comment there).
2. **`BACKEND_URL`** env var on the Vercel project — Terraform-managed
   (`infra/modules/vercel/vercel.tf`, references the existing project by
   name via a data source), kept in sync with `app_hostname` on every
   apply.
   This is the SSR path — TanStack Start's server calls the backend
   directly during `beforeLoad`.

Both must be set, or auth will work in the browser but not on first paint
(or vice versa).

## CI/CD

`.github/workflows/deploy-backend.yml` deploys on pushes to `main` that
touch `backend/**`, plus manual dispatch. It builds `backend/Dockerfile`,
pushes to `ghcr.io/<owner>/<repo>-backend`, and points the Container App
at the new image via `azure/container-apps-deploy-action` — Azure auth is
OIDC (no stored credential), using an app registration Terraform creates
in `infra/stack/ci.tf`; GHCR auth uses the workflow's own `GITHUB_TOKEN`.
Configure once, after `terragrunt apply`: see
[`infra/stack/README.md#cicd`](stack/README.md#cicd) for the exact
outputs to wire into the `Production` GitHub Environment's variables.

Database migrations are unchanged — still `migrate-database.yml`
(`dotnet ef database update`) run manually against Neon.

## Notes

- Container Apps terminates TLS and forwards `X-Forwarded-Proto`. The
  auth cookie uses `CookieSecurePolicy.Always` in production, which sets
  the `Secure` flag unconditionally, so this works without
  `UseForwardedHeaders`. Add that middleware if you ever need
  `Request.IsHttps` to be accurate in app code.
- Secrets live partly in the Container App's environment variables
  (Neon/R2/App Insights, same as before) and partly in its `secret`
  blocks (`ghcr-pat`, referenced by the registry config rather than
  exposed as a plain env var).
