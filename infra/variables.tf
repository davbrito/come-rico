variable "project_name" {
  description = "Short name used to prefix created resources."
  type        = string
  default     = "come-rico"
}

variable "stage" {
  description = "Deployment stage. Used in resource names so non-production stacks can coexist."
  type        = string
  default     = "production"
}

variable "azure_location" {
  description = "Azure region for the backend App Service."
  type        = string
  default     = "eastus"
}

# ---- Provider credentials ----

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_account_id" {
  description = "Also used to build the R2 S3 endpoint the backend talks to."
  type        = string
  sensitive   = true
}

variable "azure_subscription_id" {
  type      = string
  sensitive = true
}

variable "neon_api_key" {
  type      = string
  sensitive = true
}

# ---- Application config ----

variable "cron_secret" {
  description = "Bearer secret required by GET /api/images/cleanup."
  type        = string
  sensitive   = true
}

variable "r2_access_key_id" {
  description = "S3-compatible R2 API token ID. The backend uses AmazonS3Client with explicit credentials rather than a Worker binding, so this is needed even though Terraform creates the bucket."
  type        = string
  sensitive   = true
}

variable "r2_secret_access_key" {
  type      = string
  sensitive = true
}

variable "r2_public_base_url" {
  description = "Public base URL for the images bucket (r2.dev subdomain or custom domain). Must allow public reads."
  type        = string
}
