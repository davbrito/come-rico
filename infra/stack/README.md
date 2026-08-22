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

`ci.tf` wires up everything `deploy-backend.yml` and `migrate-database.yml`
need, end to end, via the `./modules/github_actions_ci` module —
instantiated only for `prod`; `dev` deploys stay manual:

- An Azure AD app registration + federated credential (GitHub Actions
  OIDC, no stored secret), scoped to this repo's `Production` GitHub
  Environment
- `Website Contributor` on the web app (not the plan, resource group, or
  anything else) granted to that identity
- The `Production` GitHub Environment itself (`github_repository_environment`)
- Its variables — `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
  `AZURE_SUBSCRIPTION_ID`, `AZURE_WEBAPP_NAME` — and its `DATABASE_URL`
  secret, all pushed via the `github` provider so nothing needs copy-pasting
  from `terraform output` by hand

`AZURE_WEBAPP_NAME` needs to be stable across applies, so prod should set
`app_name_unique_suffix = false` once the plain name is confirmed free
(see [Naming](#naming)) — otherwise a suffix rotation would need Terraform
to re-push the variable (which it will, on the next apply, but the two
would be out of sync until then).

Applying this needs, beyond what the rest of the stack requires:

- `Application.ReadWrite.All`-equivalent Azure AD rights (e.g. Application
  Administrator) to create the app registration
- `Microsoft.Authorization/roleAssignments/write` on the resource group
  (Owner, or User Access Administrator) to grant `Website Contributor`
- `gh auth login` run locally — the `github` provider picks up its token
  from the gh CLI automatically (no `github_token` variable to manage);
  the logged-in account needs admin on this repo to write Environments,
  Secrets, and Variables

## Infisical (provider tokens)

Provider tokens — `NEON_API_KEY`, `CLOUDFLARE_API_TOKEN`,
`VERCEL_API_TOKEN` — live in an Infisical project rather than tfvars, one
per environment slug (`dev`/`prod`, matching `var.environment` as set by
`../live/<env>/terragrunt.hcl`). `infisical.tf` reads them via
an `ephemeral "infisical_secret"` resource each, since they only ever flow
into `provider` blocks (`versions.tf`) — ephemeral values are never
written to state or plan files.

`CRON_SECRET` goes the other direction — a `random_password` resource
(`main.tf`) generates it and writes it *into* Infisical via
`resource "infisical_secret"`, purely so it's discoverable outside this
Terraform run (e.g. `infisical run` for local scripts); it's an arbitrary
shared secret, not tied to any third-party account, so there's nothing to
fetch. `app_settings` (`main.tf`) uses `random_password.cron_secret.result`
directly, not a round-trip back through Infisical — it's a plain map
attribute with no write-only variant, so it couldn't consume an ephemeral
value anyway.

`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` aren't in Infisical at all:
`r2.tf` generates them (a `cloudflare_api_token` scoped to just this
bucket — R2's S3-compatible credentials are access_key_id = token ID,
secret_access_key = SHA-256(token value), see
[developers.cloudflare.com/r2/api/tokens](https://developers.cloudflare.com/r2/api/tokens))
and passes the locals straight into `app_settings`. This needs the
Cloudflare token Terraform authenticates with (`CLOUDFLARE_API_TOKEN` in
Infisical) to also carry `Account.API Tokens: Edit`, beyond the R2/DNS
scopes described in `../README.md`.

Setup: see `../README.md` — creating the Infisical project,
its secrets, and the `.envrc` that authenticates to it is all part of the
Terragrunt bootstrap, not something done from this directory.

Requires Terraform >= 1.10 (ephemeral resources).

## Vercel (frontend)

`vercel.tf` references the existing Vercel project (`come-rico`, linked
locally via `vercel link` — see `.vercel/repo.json`) by name, through a
data source rather than importing it as a managed resource — a data
source can't accidentally overwrite framework/build settings on apply the
way `resource + terraform import` could if any attribute didn't match
exactly. The only thing actually managed is the `BACKEND_URL` environment
variable, kept in sync with the web app's real hostname. Requires
`VERCEL_API_TOKEN` (a team-scoped token from vercel.com/account/tokens,
stored in Infisical — see [Infisical](#infisical-provider-tokens)) — no
`team_id` variable needed, the token resolves it.

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
