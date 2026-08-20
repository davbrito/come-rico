variable "workload" {
  type = string
}

variable "environment" {
  type = string
}

variable "github_repository" {
  description = "GitHub \"owner/repo\" this CI identity is allowed to deploy from."
  type        = string
}

variable "azure_tenant_id" {
  type = string
}

variable "azure_subscription_id" {
  type = string
}

variable "azure_web_app_id" {
  description = "Scope for the Website Contributor role assignment."
  type        = string
}

variable "azure_web_app_name" {
  type = string
}

variable "database_connection_string" {
  description = "ADO.NET connection string pushed as the Production environment's DATABASE_URL secret."
  type        = string
  sensitive   = true
}
