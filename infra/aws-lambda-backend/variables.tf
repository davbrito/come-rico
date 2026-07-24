variable "aws_region" {
  description = "AWS region to deploy the backend Lambda into."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short name used to prefix all created resources."
  type        = string
  default     = "come-rico-backend"
}

variable "image_tag" {
  description = "Tag of the container image (in the ECR repo created here) to deploy. Push an image with this tag before applying, or re-apply after pushing a new one."
  type        = string
  default     = "latest"
}

variable "memory_size" {
  description = "Lambda memory (MB). Also determines allocated CPU."
  type        = number
  default     = 512
}

variable "timeout" {
  description = "Lambda invocation timeout, in seconds."
  type        = number
  default     = 29 # Function URL hard caps a request/response cycle at 30s
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for the function's log group."
  type        = number
  default     = 14
}

# ---- App configuration (mirrors what Vercel currently injects as env vars) ----

variable "connection_string" {
  description = "Neon Postgres connection string (ADO.NET keyword=value format), set as ConnectionStrings__DefaultConnection."
  type        = string
  sensitive   = true
}

variable "r2_service_url" {
  description = "Cloudflare R2 S3-compatible endpoint, e.g. https://<account_id>.r2.cloudflarestorage.com."
  type        = string
}

variable "r2_access_key_id" {
  type      = string
  sensitive = true
}

variable "r2_secret_access_key" {
  type      = string
  sensitive = true
}

variable "r2_bucket_name" {
  type = string
}

variable "r2_public_base_url" {
  type = string
}

variable "cron_secret" {
  description = "Bearer secret required by GET /api/images/cleanup; also used by the EventBridge Scheduler API destination below."
  type        = string
  sensitive   = true
}

variable "cleanup_cron_schedule" {
  description = "EventBridge Scheduler cron expression for the orphaned-file cleanup job. Matches the previous Vercel Cron schedule (weekly, Sunday 00:00 UTC)."
  type        = string
  default     = "cron(0 0 ? * SUN *)"
}
