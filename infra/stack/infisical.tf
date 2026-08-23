# GHCR pull credential — the Container App needs a longer-lived PAT to
# pull the backend image at runtime (GITHUB_TOKEN, used by
# deploy-backend.yml to push, expires with the workflow run). The PAT
# itself is created by hand in GitHub (Terraform can't generate one) and
# stored in Infisical under the "GHCR_PAT" key, same env-per-environment
# layout as everything else here.
#
# Not the ephemeral "infisical_secret" resource: azurerm_container_app's
# secret.value attribute isn't write-only/ephemeral-capable, so an
# ephemeral value can't flow into it — this data source is the ordinary,
# state-backed read, same tradeoff every other secret here already makes
# (R2 keys, the Neon connection string, cron_secret all land in state via
# plain resource attributes too).
data "infisical_secrets" "this" {
  env_slug     = var.environment
  workspace_id = var.infisical_project_id
  folder_path  = "/"
}

locals {
  ghcr_pat = data.infisical_secrets.this.secrets["GHCR_PAT"].value
}
