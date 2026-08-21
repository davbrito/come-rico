locals {
  azure_tags = {
    project     = "come-rico"
    environment = var.environment
  }
}

resource "azurerm_resource_group" "this" {
  name     = local.resource_group_name
  location = var.azure_location
  tags     = local.azure_tags
}

resource "azurerm_service_plan" "this" {
  name                = local.service_plan_name
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  os_type             = "Linux"
  sku_name            = var.sku_name
  tags                = local.azure_tags
}

resource "azurerm_linux_web_app" "api" {
  name                = local.app_name
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  service_plan_id     = azurerm_service_plan.this.id
  tags                = local.azure_tags
  https_only          = true

  site_config {
    # F1 doesn't support Always On — the azurerm provider defaults this to
    # true, which Azure rejects on the free tier.
    always_on     = false
    http2_enabled = true
    # /health (app.MapHealthChecks in Program.cs) — pings DB connectivity
    # too via AddDbContextCheck. F1 only ever runs one instance, so this
    # doesn't drive load-balancer eviction here, but App Service still
    # surfaces it in the portal and restarts the instance on repeated
    # failures.
    health_check_path                 = "/health"
    health_check_eviction_time_in_min = 2
    application_stack {
      dotnet_version = "10.0"
    }
  }

  identity {
    type = "SystemAssigned"
  }

  app_settings = {
    ASPNETCORE_ENVIRONMENT = var.environment == "prod" ? "Production" : "Staging"
    ASPNETCORE_URLS        = "http://0.0.0.0:8080"
    WEBSITES_PORT          = "8080"
    # Mounts the deployed zip read-only instead of extracting it to
    # wwwroot — faster cold starts and avoids the file-attribute quirks
    # (e.g. lost executable bits) that extraction can introduce.
    WEBSITE_RUN_FROM_PACKAGE = "1"
    # Read by Azure.Monitor.OpenTelemetry.AspNetCore's UseAzureMonitor() in
    # Program.cs by convention — reports requests, dependencies, exceptions,
    # and ILogger traces to Application Insights.
    APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.api.connection_string
    ConnectionStrings__DefaultConnection  = local.database_connection_string
    R2__ServiceUrl                        = local.r2_service_url
    R2__AccessKeyId                       = var.r2_access_key_id
    R2__SecretAccessKey                   = var.r2_secret_access_key
    R2__BucketName                        = cloudflare_r2_bucket.images.name
    R2__PublicBaseUrl                     = local.r2_public_base_url
    CRON_SECRET                           = var.cron_secret
  }
}
