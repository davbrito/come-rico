variable "workload" {
  description = "Short workload/project name used to build resource names (Azure CAF convention: <resource-type>-<workload>-<environment>[-<region>])."
  type        = string
  default     = "come-rico"
}

variable "environment" {
  description = "Deployment environment, e.g. prod, staging, dev. Used in resource names and to namespace Neon branches / R2 buckets."
  type        = string
  default     = "prod"
}

variable "azure_location" {
  description = "Azure region for this environment's own resource group (Neon-adjacent resources, R2 aside). Independent of the shared Container Apps Environment's region (see container_apps_environment_id) — Azure allows a Container App and the environment it belongs to to live in different resource groups/regions."
  type        = string
  default     = "canadaeast"
}

variable "app_name_unique_suffix" {
  description = "Append a random 4-char suffix to the Container App name. Set false once you've confirmed the plain name is available and want a stable hostname."
  type        = bool
  default     = true
}

variable "container_apps_environment_id" {
  description = "Resource ID of the shared Container Apps Environment every environment's Container App deploys into — this subscription caps Container App Environments at 1 per subscription (MaxNumberOfGlobalEnvironmentsInSubExceeded), so it's provisioned once by ../modules/container_apps_environment (../live/platform/container-apps-environment) and passed in via a Terragrunt `dependency` block, not created per-environment here."
  type        = string
}

# --- GitHub Container Registry ------------------------------------------
# Free image registry — avoids needing a paid Azure Container Registry SKU.
# Images are pushed by deploy-backend.yml (GITHUB_TOKEN, scoped to that
# run); Container Apps needs a longer-lived credential to *pull* at
# runtime, since GITHUB_TOKEN expires with the workflow run.

variable "ghcr_owner" {
  description = "GitHub org/user that owns the backend image's GHCR package, e.g. \"davbrito\". Set once, in ../root.hcl's shared inputs."
  type        = string
}

variable "base_domain" {
  description = "Base domain the app is served from. Used to derive the R2 custom domain (storage-<environment>.<base_domain>) and the frontend origin allowed through R2 CORS."
  type        = string
}

# --- Neon (Postgres) ---------------------------------------------------

variable "neon_region_id" {
  description = "Neon region for this environment's project. See https://neon.com/docs/introduction/regions."
  type        = string
  default     = "aws-us-east-1"
}

variable "neon_pg_version" {
  type    = number
  default = 18
}

# --- Cloudflare R2 -------------------------------------------------------

variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the R2 bucket."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Zone ID for the DNS zone that owns base_domain — used to attach the R2 bucket's custom domain (needs Zone.DNS: Edit on the API token)."
  type        = string
}

variable "r2_location_hint" {
  description = "R2 location hint, one of apac/eeur/enam/weur/wnam/oc."
  type        = string
  default     = "enam"
}

variable "r2_cors_allowed_origins" {
  description = "Extra origins allowed to GET/PUT objects directly against the R2 bucket (browser uploads/downloads), besides https://<base_domain>."
  type        = list(string)
  default = [
    "http://localhost:3000",
  ]
}

# --- Infisical -----------------------------------------------------------
# Provider tokens (neon_api_key, cloudflare_api_token, vercel_api_token,
# r2_access_key_id, r2_secret_access_key, cron_secret) live in Infisical
# instead of tfvars — see infisical.tf.

variable "infisical_project_id" {
  description = "Infisical project ID holding come-rico's provider tokens."
  type        = string
}
