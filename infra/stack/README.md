# infra/stack — Terraform module

This is the Terraform **module**: no backend block, no per-environment
values baked in. It's never applied directly — always through Terragrunt
(`../root.hcl`, `../live/<env>/`), which supplies `environment` and
every other input and generates the remote-state backend per environment.
See `../README.md` for how to actually run `plan`/`apply`.

Manages, per environment (`var.environment`):

- **Azure**: resource group, Container Apps Environment, and Container
  App described in `../azure.md`
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
`cae-come-rico-prod-eus`, `ca-come-rico-prod`. `environment` (and
everything else) comes from `../live/<env>/terragrunt.hcl` — that's what
defines each environment as a fully separate stack, with its own state
path.

`app_name_unique_suffix` still exists for extra insurance against a name
collision within the resource group, but Container Apps ingress FQDNs are
already unique per environment on their own (they carry an
environment-generated label) — disable it once you've confirmed the
plain name works and want a stable *resource* name (already done for
`prod`, see `../live/prod/terragrunt.hcl`).

Outputs `app_hostname` (the Container App's ingress FQDN) — wire it into
the Vercel routes and the `BACKEND_URL` Vercel env var, as described in
`../azure.md`. Unlike App Service's fully predictable
`<name>.azurewebsites.net`, this value is only known after the first
`terragrunt apply`.

## What's still manual

- **Database migrations** — still `migrate-database.yml`, unrelated to
  provisioning.
- **`GHCR_PAT`** — a GitHub PAT (`read:packages` scope) created by hand in
  GitHub's settings, not something Terraform can generate; store it in
  Infisical under the `GHCR_PAT` key for each environment (see
  [Secrets](#secrets)).

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
- `Container Apps Contributor` on _this_ environment's Container App (not
  the environment resource, resource group, or anything else) granted to
  the shared identity
- The GitHub Environment itself (`github_repository_environment`)
- Its variables — `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
  `AZURE_SUBSCRIPTION_ID`, `AZURE_CONTAINER_APP_NAME`,
  `AZURE_RESOURCE_GROUP_NAME` — and its
  `ConnectionStrings__DefaultConnection` secret, all pushed via the
  `github` provider so nothing needs copy-pasting from `terraform output`
  by hand

`AZURE_CONTAINER_APP_NAME` needs to be stable across applies, so prod sets
`app_name_unique_suffix = false` once the plain name is confirmed free
(see [Naming](#naming)) — otherwise a suffix rotation would need Terraform
to re-push the variable (which it will, on the next apply, but the two
would be out of sync until then).

Applying `../live/platform/ci` and either env's `ci.tf` needs, beyond
what the rest of the stack requires:

- `Application.ReadWrite.All`-equivalent Azure AD rights (e.g. Application
  Administrator) to create the app registration (`../live/platform/ci` only)
- `Microsoft.Authorization/roleAssignments/write` on the resource group
  (Owner, or User Access Administrator) to grant `Container Apps Contributor`
- `gh auth login` run locally — the `github` provider picks up its token
  from the gh CLI automatically (no `github_token` variable to manage);
  the logged-in account needs admin on this repo to write Environments,
  Secrets, and Variables

CI itself needs a `GHCR_PAT` (see `../.envrc.example`) — a GitHub PAT with
`read:packages` scope, stored as a Container App secret so it can pull the
image at runtime. `deploy-backend.yml`'s own pushes use the workflow's
ephemeral `GITHUB_TOKEN` instead (`packages: write` permission), since
that's sufficient for pushing and doesn't need to be a long-lived
credential.

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

The `/api/(.*)` rewrite is a `vercel_project_route` resource in
`../modules/vercel/vercel.tf`, not a static `vercel.json` entry — its
`dest` field is a hardcoded literal (the Vercel provider panics on an
interpolated one), so it needs a one-time hand-edit to the real
`app_hostname` after each environment's first apply; see the comment on
those resources.

## Secrets

`infisical.tf` reads externally-issued tokens that Terraform can't
generate itself — currently just `GHCR_PAT`, read per-environment via
`data "infisical_secrets"` (`env_slug = var.environment`, `folder_path =
"/"`) and wired into the Container App's `ghcr-pat` secret. Deliberately
the ordinary (state-backed) data source, not the ephemeral
`infisical_secret` resource: `azurerm_container_app`'s `secret.value`
attribute isn't write-only/ephemeral-capable, so an ephemeral value can't
flow into it — same tradeoff every other secret here already makes (R2
keys, the Neon connection string, `cron_secret` all land in state via
plain resource attributes too).

## Monitoring

`monitoring.tf` creates a Log Analytics workspace + workspace-based
Application Insights, wired into the Container App via
`APPLICATIONINSIGHTS_CONNECTION_STRING` and consumed directly as the
Container Apps Environment's own Log Analytics workspace. Instrumentation
is code-based —
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

Don't also enable an agent-based auto-instrumentation sidecar alongside
this — mixing that with the code-based SDK double-counts telemetry.

## Changing settings later

Anything under `template.container.env` in `main.tf` (env vars, connection
strings) is the single source of truth now — don't hand-edit them in the
Azure Portal or with `az containerapp update --set-env-vars`, and don't
hand-edit the Neon branch/role/database or R2 bucket in their dashboards
either; `terraform apply` will revert manual changes on the next run (by
design). The one deliberate exception is the container `image` itself —
`main.tf`'s `lifecycle.ignore_changes` lets `deploy-backend.yml` move it
via `az containerapp update --image` without Terraform fighting it back
to whatever tag main.tf seeds on the first apply.
