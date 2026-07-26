# ---------------------------------------------------------------------------
# Backend — ASP.NET Core on Azure App Service (free F1)
#
# F1 is $0 and doesn't expire. Its limits: 60 CPU-min/day, 1 GB RAM, no
# custom-domain SSL, and no "Always On" — the app unloads after ~20 minutes
# idle. The keep-warm cron in cloudflare.tf is what stops that becoming a
# 20-40s cold start for real users.
#
# `az appservice plan update --sku B1` (~$13/mo) lifts all of those.
# ---------------------------------------------------------------------------

resource "azurerm_resource_group" "main" {
  name     = "${var.project_name}-${var.stage}"
  location = var.azure_location
}

resource "azurerm_service_plan" "main" {
  name                = "${var.project_name}-${var.stage}-plan"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "F1"
}

resource "azurerm_linux_web_app" "api" {
  name                = "${var.project_name}-${var.stage}-api"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_service_plan.main.location
  service_plan_id     = azurerm_service_plan.main.id
  https_only          = true

  site_config {
    # The backend is published self-contained, so it carries its own .NET 10
    # runtime and the host stack version doesn't need to match — .NET 10 is
    # still Preview-tagged on App Service in some regions.
    app_command_line = "./ComeRico.Api"
    always_on        = false # not supported on F1
  }

  app_settings = {
    ASPNETCORE_ENVIRONMENT               = "Production"
    ASPNETCORE_URLS                      = "http://0.0.0.0:8080"
    WEBSITES_PORT                        = "8080"
    ConnectionStrings__DefaultConnection = local.connection_string
    R2__ServiceUrl                       = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
    R2__AccessKeyId                      = var.r2_access_key_id
    R2__SecretAccessKey                  = var.r2_secret_access_key
    R2__BucketName                       = cloudflare_r2_bucket.images.name
    R2__PublicBaseUrl                    = var.r2_public_base_url
    CRON_SECRET                          = var.cron_secret
  }
}

# Note: the application binary is pushed by `az webapp deploy` in CI —
# azurerm has no first-class "ship this zip" resource, so Terraform owns
# this app's configuration but not its code.

locals {
  backend_url = "https://${azurerm_linux_web_app.api.default_hostname}"
}
