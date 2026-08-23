# A single Container Apps Environment, shared by every environment's
# Container App (dev and prod both deploy into this one). Deliberately
# its own Terragrunt unit (../../live/platform/container-apps-environment)
# rather than living inside any one environment's stack — this
# subscription caps Container App Environments at 1 *per subscription*
# (MaxNumberOfGlobalEnvironmentsInSubExceeded), not per environment or
# region, so ../../stack/main.tf can no longer provision its own.
#
# Sharing the environment only shares its networking/logging boundary —
# each environment's azurerm_container_app is still a fully separate
# resource with its own revisions, secrets, and env vars, living in that
# environment's own resource group. Application-level telemetry
# (Application Insights) also stays per-environment — see
# ../../stack/monitoring.tf — this module's own Log Analytics workspace
# is only for the environment's infrastructure-level logs.
#
# The CI identity (shared across environments too, see
# ../github_actions_ci) needs read access to this environment — the
# deploy workflow's `az containerapp env show` call fails otherwise, even
# though it's only touching one environment's own Container App — so that
# role assignment lives here rather than being duplicated in every
# environment's own ci.tf.

resource "azurerm_resource_group" "this" {
  name     = "rg-${var.workload}-platform-${var.azure_location}"
  location = var.azure_location
  tags = {
    project = var.workload
  }
}

resource "azurerm_log_analytics_workspace" "this" {
  name                = "log-${var.workload}-platform-${var.azure_location}"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = 0.1 # infra-level logs only — app telemetry goes through each environment's own workspace instead
  tags = {
    project = var.workload
  }
}

resource "azurerm_container_app_environment" "this" {
  name                       = "cae-${var.workload}-platform-${var.azure_location}"
  resource_group_name        = azurerm_resource_group.this.name
  location                   = azurerm_resource_group.this.location
  logs_destination           = "log-analytics"
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
  tags = {
    project = var.workload
  }
}

# Read-only — the deploy workflow only ever reads this environment
# (`az containerapp env show`) to resolve where a Container App lives
# before updating that app itself, which each environment's own ci.tf
# already grants "Container Apps Contributor" for, scoped to that
# environment's resource group.
resource "azurerm_role_assignment" "github_actions_read_environment" {
  scope                = azurerm_container_app_environment.this.id
  role_definition_name = "Reader"
  principal_id         = var.github_actions_principal_id
}
