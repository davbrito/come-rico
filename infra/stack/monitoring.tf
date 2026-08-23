# Azure Monitor / Application Insights — stays within the always-free
# allowance (5 GB/month log ingestion per billing account, shared across
# every workspace on it: https://azure.microsoft.com/pricing/details/monitor/).
# For a low-traffic household app this is orders of magnitude more than
# needed, but daily_quota_gb below is a hard stop well under that so a
# traffic spike or noisy logging bug can't turn into a bill.

resource "azurerm_log_analytics_workspace" "this" {
  name                = "log-${var.workload}-${var.environment}-${local.region_abbreviation}"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  sku                 = "PerGB2018" # only SKU available for new workspaces; billing still starts at 0 within the free grant
  retention_in_days   = 30          # within the free retention window — longer costs extra
  daily_quota_gb      = 0.1         # ~3GB/month cap, safely under the 5GB free allowance
  tags                = local.azure_tags
}

resource "azurerm_application_insights" "api" {
  name                = "appi-${var.workload}-${var.environment}"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  workspace_id        = azurerm_log_analytics_workspace.this.id
  application_type    = "web"
  retention_in_days   = 30
  tags                = local.azure_tags
}
