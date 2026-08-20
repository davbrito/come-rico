# Terraform — Azure backend hosting

Manages, per environment (`var.environment`, default `prod`):

- **Azure**: resource group, App Service Plan (F1 by default) and Linux
  Web App described in `../azure.md`
- **Neon**: a Postgres project/branch/database/role (see
  [neon.com/docs/reference/terraform](https://neon.com/docs/reference/terraform))
- **Cloudflare R2**: the image storage bucket, its CORS policy, and a
  custom domain (`storage-<environment>.<base_domain>`, e.g.
  `storage-prod.comerico.davbrito.dev` by default)

State is local by default — this is a single-developer stack; switch to a
remote backend (`azurerm` storage, or Terraform Cloud) if you add more
environments or contributors.

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

## Usage

```bash
az login

cd infra/terraform
terraform init

cp terraform.tfvars.example terraform.tfvars   # fill in real secrets
terraform plan
terraform apply
```

Outputs `app_hostname` — wire it into `vercel.json`'s `/api/(.*)` rewrite
and the `BACKEND_URL` Vercel env var, as described in `../azure.md`.

## What's still manual

- **R2 access keys** (`r2_access_key_id` / `r2_secret_access_key`) — the
  Cloudflare Terraform provider can create and configure the R2 bucket
  itself, but the S3-compatible credential pair used by the app is only
  available from the dashboard (R2 → Manage API Tokens), not as a
  Terraform resource. Those same keys authenticate the `aws` provider,
  which manages the bucket's CORS policy against R2's S3-compatible API —
  see [developers.cloudflare.com/r2/examples/terraform-aws](https://developers.cloudflare.com/r2/examples/terraform-aws/).
- **CI/CD secrets**: `AZURE_WEBAPP_PUBLISH_PROFILE` and
  `AZURE_WEBAPP_NAME` in the GitHub `Production` environment — fetch the
  publish profile with `az webapp deployment list-publishing-profiles`
  (see `../azure.md`) and paste it in by hand. Not modeled in Terraform;
  it's a deploy credential, not infrastructure.
- **Database migrations** — still `migrate-database.yml`, unrelated to
  provisioning.
- **Uptime pinger** (UptimeRobot) — external service, nothing to manage
  here.

## Changing settings later

Anything under `app_settings` in `main.tf` (env vars, connection strings)
is the single source of truth now — don't hand-edit them in the Azure
Portal or with `az webapp config appsettings set`, and don't hand-edit the
Neon branch/role/database or R2 bucket in their dashboards either;
`terraform apply` will revert manual changes on the next run (by design).
