# Terraform — Azure backend hosting

Manages, per environment (`var.environment`, default `prod`):

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

State lives in Cloudflare R2, not locally — see [Remote state](#remote-state).

## Naming

Resource names follow the [Azure CAF abbreviation
convention](https://learn.microsoft.com/azure/cloud-adoption-framework/ready/azure-best-practices/resource-abbreviations):
`<type>-<workload>-<environment>[-<region>]`, e.g. `rg-come-rico-prod-eus`,
`plan-come-rico-prod-eus`, `app-come-rico-prod-<random>`. Change
`workload`/`environment` in `terraform.tfvars` to deploy a second
environment (`staging`, `dev`, ...) as a fully separate stack — use a
different local state file or workspace per environment so they don't
collide.

The App Service name gets a random 4-character suffix by default
(`app_name_unique_suffix`) since `*.azurewebsites.net` is a global
namespace; disable it once you've confirmed the plain name is free and
want a stable hostname.

## Remote state

State lives in a dedicated R2 bucket (`come-rico-tfstate`), via the `s3`
backend Cloudflare documents at
[developers.cloudflare.com/terraform/advanced-topics/remote-backend](https://developers.cloudflare.com/terraform/advanced-topics/remote-backend/).
Bootstrap it once — Terraform can't create the bucket it's about to store
its own state in:

```bash
# Cloudflare dashboard → R2 → Create bucket → "come-rico-tfstate"
# (or: npx wrangler r2 bucket create come-rico-tfstate)

cd infra/terraform
cp backend.hcl.example backend.hcl   # fill in your R2 access key + account id
terraform init -backend-config=backend.hcl
```

Workspaces (`default` = prod, `dev`, ...) each get their own path in the
bucket automatically — no per-environment backend config needed. If you're
migrating a workspace that already had local state, add `-migrate-state`
to the `init` above (once per workspace).

## Usage

```bash
az login

cd infra/terraform
terraform init -backend-config=backend.hcl   # already ran once? just: terraform init

cp terraform.tfvars.example terraform.tfvars   # fill in real secrets
terraform plan
terraform apply
```

Outputs `app_hostname` — wire it into `vercel.json`'s `/api/(.*)` rewrite
and the `BACKEND_URL` Vercel env var, as described in `../azure.md`.

## What's still manual

- **R2 access keys** (`r2_access_key_id` / `r2_secret_access_key`) — the
  S3-compatible credential pair the app uses to sign uploads is only
  available from the dashboard (R2 → Manage API Tokens), not as a
  Terraform resource. Bucket, CORS, and lifecycle are all Terraform-managed
  via the native `cloudflare_r2_bucket*` resources.
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

## Vercel (frontend)

`vercel.tf` references the existing Vercel project (`come-rico`, linked
locally via `vercel link` — see `.vercel/repo.json`) by name, through a
data source rather than importing it as a managed resource — a data
source can't accidentally overwrite framework/build settings on apply the
way `resource + terraform import` could if any attribute didn't match
exactly. The only thing actually managed is the `BACKEND_URL` environment
variable, kept in sync with the web app's real hostname. Requires
`vercel_api_token` (a team-scoped token from
vercel.com/account/tokens — no `team_id` variable needed, the token
resolves it).

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
