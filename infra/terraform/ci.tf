# GitHub Actions CI identity + repo wiring — only for prod, the one
# environment auto-deployed by CI (see .github/workflows/deploy-backend.yml);
# dev stays a manual `terraform apply` + manual deploy from your machine.
# All the actual resources live in modules/github_actions_ci so this one
# `count` on the module call replaces a `count` on every resource inside it.

variable "github_repository" {
  description = "GitHub \"owner/repo\" this stack's CI is allowed to deploy from."
  type        = string
  default     = "davbrito/come-rico"
}

locals {
  github_owner = split("/", var.github_repository)[0]
}

data "azurerm_client_config" "current" {}

module "github_actions_ci" {
  count  = var.environment == "prod" ? 1 : 0
  source = "./modules/github_actions_ci"

  workload              = var.workload
  environment           = var.environment
  github_repository     = var.github_repository
  azure_tenant_id       = data.azurerm_client_config.current.tenant_id
  azure_subscription_id = data.azurerm_client_config.current.subscription_id
  azure_web_app_id      = azurerm_linux_web_app.api.id
  azure_web_app_name    = azurerm_linux_web_app.api.name

  database_connection_string = local.database_connection_string
}
