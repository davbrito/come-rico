variable "workload" {
  description = "Short workload/project name used to build resource names."
  type        = string
  default     = "come-rico"
}

variable "environment" {
  description = "Deployment environment, e.g. prod, dev. Used in resource names and to namespace Neon branches / R2 buckets."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region for this environment's Lambda function."
  type        = string
  default     = "us-east-1"
}

variable "app_name_unique_suffix" {
  description = "Append a random 4-char suffix to the Lambda function name. Set false once you've confirmed the plain name is available and want a stable name."
  type        = bool
  default     = true
}

variable "oidc_provider_arn" {
  description = "ARN of the shared GitHub Actions OIDC provider — AWS allows only one per issuer URL per account, so it's provisioned once by ../modules/aws_oidc (../live/platform/aws-oidc) and passed in via a Terragrunt `dependency` block, not created per-environment here."
  type        = string
}

variable "base_domain" {
  description = "Base domain the app is served from. Used to derive the R2 custom domain (storage-<environment>.<base_domain>) and the frontend origin allowed through R2 CORS."
  type        = string
}

variable "github_repository" {
  description = "GitHub \"owner/repo\" this environment's CI is allowed to deploy from. Set once, in ../root.hcl's shared inputs."
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
# Externally-issued provider tokens live in Infisical instead of tfvars —
# see infisical.tf.

variable "infisical_project_id" {
  description = "Infisical project ID holding come-rico's provider tokens."
  type        = string
}
