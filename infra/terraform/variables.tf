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
  description = "Azure region for the resource group and App Service."
  type        = string
  default     = "canadaeast"
}

variable "sku_name" {
  description = "App Service Plan SKU. Pinned to F1, the only always-free tier (60 CPU-min/day, sleeps after 20min idle, no custom-domain SSL, no Always On). Change deliberately if you outgrow it — that's a billing decision, not something to default away from."
  type        = string
  default     = "F1"

  validation {
    condition     = var.sku_name == "F1"
    error_message = "sku_name must stay \"F1\" (the free tier) — this stack is meant to run entirely within Azure's free tier."
  }
}

variable "app_name_unique_suffix" {
  description = "Append a random 4-char suffix to the App Service name to help it stay globally unique. Set false once you've confirmed the plain name is available and want a stable hostname."
  type        = bool
  default     = true
}

variable "base_domain" {
  description = "Base domain the app is served from. Used to derive the R2 custom domain (storage-<environment>.<base_domain>) and the frontend origin allowed through R2 CORS."
  type        = string
}

# --- Neon (Postgres) ---------------------------------------------------

variable "neon_api_key" {
  description = "Neon API key (https://console.neon.tech/app/settings/api-keys)."
  type        = string
  sensitive   = true
}

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

variable "cloudflare_api_token" {
  description = "Cloudflare API token scoped to R2 (Account.Workers R2 Storage: Edit) and, if managing DNS for r2_public_base_url, Zone.DNS: Edit."
  type        = string
  sensitive   = true
}

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

variable "r2_access_key_id" {
  description = "R2 S3-compatible access key ID. Generated from the Cloudflare dashboard (R2 > Manage API Tokens) — not managed by the Cloudflare Terraform provider."
  type        = string
  sensitive   = true
}

variable "r2_secret_access_key" {
  description = "R2 S3-compatible secret access key, paired with r2_access_key_id."
  type        = string
  sensitive   = true
}

variable "r2_cors_allowed_origins" {
  description = "Extra origins allowed to GET/PUT objects directly against the R2 bucket (browser uploads/downloads), besides https://<base_domain>."
  type        = list(string)
  default = [
    "http://localhost:3000",
  ]
}

# --- App secrets not otherwise modeled -----------------------------------

variable "cron_secret" {
  description = "Shared secret that authorizes calls to the app's scheduled/cron endpoints."
  type        = string
  sensitive   = true
}
