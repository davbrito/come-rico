variable "workload" {
  type    = string
  default = "come-rico"
}

variable "azure_location" {
  description = "Azure region for the shared Container Apps Environment. Every environment's Container App must live in this same region (Container Apps Environments aren't cross-region)."
  type        = string
  default     = "canadaeast"
}

variable "github_actions_principal_id" {
  description = "Shared CI identity's service principal object ID — from ../../live/platform/container-apps-environment/terragrunt.hcl's dependency on ../ci."
  type        = string
}
