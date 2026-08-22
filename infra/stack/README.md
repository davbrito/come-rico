# infra/stack — Terraform module

This is the Terraform **module**: no backend block, no per-environment
values baked in. It's never applied directly — always through Terragrunt
(`../root.hcl`, `../live/<env>/`), which supplies `environment` and
every other input and generates the remote-state backend per environment.
See `../README.md` for how to actually run `plan`/`apply`.

Manages, per environment (`var.environment`):

- **Azure**: resource group, App Service Plan (F1 by default) and Linux
  Web App described in `../azure.md`
- **Neon**: a Postgres project/branch/database/role (see
  [neon.com/docs/reference/terraform](https://neon.com/docs/reference/terraform))
- **Cloudflare R2**: the image storage bucket, its CORS policy, and a
  custom domain (`storage-<environment>.<base_domain>`, e.g.
  `storage-prod.comerico.davbrito.dev` by default)
- **Monitoring**: a Log Analytics workspace + workspace-based Application
  Insights (`monitoring.tf`), wired into the web app via auto-instrumentation
  app settings — no SDK/code changes. See [Monitoring](#monitoring) for the
  free-tier guardrails.

State lives in Cloudflare R2, not locally — see
`../root.hcl`'s `remote_state` block, not this module.

## Naming

Resource names follow the [Azure CAF abbreviation
convention](https://learn.microsoft.com/azure/cloud-adoption-framework/ready/azure-best-practices/resource-abbreviations):
`<type>-<workload>-<environment>[-<region>]`, e.g. `rg-come-rico-prod-eus`,
`plan-come-rico-prod-eus`, `app-come-rico-prod-<random>`. `environment`
(and everything else) comes from
`../live/<env>/terragrunt.hcl` — that's what defines each
environment as a fully separate stack, with its own state path.

The App Service name gets a random 4-character suffix by default
(`app_name_unique_suffix`) since `*.azurewebsites.net` is a global
namespace; disable it once you've confirmed the plain name is free and
want a stable hostname (already done for `prod`, see
`../live/prod/terragrunt.hcl`).

Outputs `app_hostname` — wire it into `vercel.json`'s `/api/(.*)` rewrite
and the `BACKEND_URL` Vercel env var, as described in `../azure.md`.

## What's still manual

- **Database migrations** — still `migrate-database.yml`, unrelated to
  provisioning.
- **Uptime pinger** (UptimeRobot) — external service, nothing to manage
  here.

## CI/CD

`deploy-backend.yml` and `migrate-database.yml` authenticate to Azure via
one shared identity — a single Azure AD app + service principal — used by
_both_ `dev` and `prod`, so it's provisioned once by
`../modules/github_actions_ci` as its own Terragrunt unit
(`../live/platform/ci`), not inside either environment's own state (see
that module's `main.tf` for why). Everything environment-_specific_ lives in
this directory's `ci.tf` instead, applied once per environment
(`../live/dev`, `../live/prod`), pulling the shared identity's
`client_id`/`application_id`/`principal_id` in via a Terragrunt
`dependency` block:

- A federated credential (GitHub Actions OIDC, no stored secret) scoped
  to _this_ environment's GitHub Environment (`var.github_environment_name`
  — `"Production"` for `prod`, `"Development"` for `dev`; set in
  `../live/<env>/terragrunt.hcl`) — not a branch ref, so it only trusts
  runs that went through that environment's protection rules
- `Website Contributor` on _this_ environment's web app (not the plan,
  resource group, or anything else) granted to the shared identity
- The GitHub Environment itself (`github_repository_environment`)
- Its variables — `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
  `AZURE_SUBSCRIPTION_ID`, `AZURE_WEBAPP_NAME` — and its
  `ConnectionStrings__DefaultConnection` secret, all pushed via the
  `github` provider so nothing needs copy-pasting from `terraform output`
  by hand

`AZURE_WEBAPP_NAME` needs to be stable across applies, so prod sets
`app_name_unique_suffix = false` once the plain name is confirmed free
(see [Naming](#naming)) — otherwise a suffix rotation would need Terraform
to re-push the variable (which it will, on the next apply, but the two
would be out of sync until then).

Applying `../live/platform/ci` and either env's `ci.tf` needs, beyond
what the rest of the stack requires:

- `Application.ReadWrite.All`-equivalent Azure AD rights (e.g. Application
  Administrator) to create the app registration (`../live/platform/ci` only)
- `Microsoft.Authorization/roleAssignments/write` on the resource group
  (Owner, or User Access Administrator) to grant `Website Contributor`
- `gh auth login` run locally — the `github` provider picks up its token
  from the gh CLI automatically (no `github_token` variable to manage);
  the logged-in account needs admin on this repo to write Environments,
  Secrets, and Variables

## Vercel (frontend)

Not managed here — like the CI identity, there's exactly one Vercel
project (`come-rico`), not one per environment, so it lives in
`../modules/vercel` as its own Terragrunt unit (`../live/platform/vercel`),
not this stack. It depends on both `../live/prod`'s and `../live/dev`'s
`app_hostname` outputs (via Terragrunt `dependency` blocks): the
production Vercel deployment (host matches `base_domain`) routes to prod,
every other deployment (previews, the default `*.vercel.app` alias)
routes to dev as a staging target — both the `BACKEND_URL` env var and the
`/api/*` rewrite are split this way, built from those `dependency`
outputs. Dev also sets `app_name_unique_suffix = false` (see
[Naming](#naming), same as prod) — not strictly required for this, but a
stable hostname makes for a nicer staging URL. See
`../modules/vercel/vercel.tf` for the full picture, including why the
dependency has to point *at* prod/dev rather than the other way around
(the CI identity's dependency already runs the other direction).

vercel.json's `/api/(.*)` rewrite destination is a separate, static
reference to the same hostname — Vercel reads that file directly, so it's
not Terraform-templated; update it by hand if `app_name` ever changes.

## Monitoring

`monitoring.tf` creates a Log Analytics workspace + workspace-based
Application Insights, wired into the web app via
`APPLICATIONINSIGHTS_CONNECTION_STRING`. Instrumentation is code-based —
`Program.cs` calls `AddOpenTelemetry().UseAzureMonitor()` (only when that
connection string is set, so it's a no-op in local dev), which covers
ASP.NET Core requests, outgoing HttpClient calls, exceptions, and ILogger
traces out of the box; Npgsql's `ActivitySource` is added explicitly
(`.WithTracing(t => t.AddSource("Npgsql"))`) since it isn't part of the
default set.

Stays within Azure Monitor's always-free 5 GB/month log ingestion (shared
across the billing account, not per-workspace) — for a low-traffic
household app this is far more headroom than needed, but
`daily_quota_gb = 0.1` on the workspace is a hard stop (~3 GB/month) so a
traffic spike or noisy logging bug can't turn into a bill. `retention_in_days = 30`
on both resources stays inside the free retention window too — extending
either costs extra.

Don't also enable App Service's built-in "Application Insights" extension
(`ApplicationInsightsAgent_EXTENSION_VERSION`) alongside this — mixing
agent-based auto-instrumentation with the code-based SDK double-counts
telemetry.

## Changing settings later

Anything under `app_settings` in `main.tf` (env vars, connection strings)
is the single source of truth now — don't hand-edit them in the Azure
Portal or with `az webapp config appsettings set`, and don't hand-edit the
Neon branch/role/database or R2 bucket in their dashboards either;
`terraform apply` will revert manual changes on the next run (by design).
