resource "azurerm_resource_group" "this" {
  name     = local.resource_group_name
  location = var.azure_location
}

resource "azurerm_service_plan" "this" {
  name                = local.service_plan_name
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  os_type             = "Linux"
  sku_name            = var.sku_name
}

# Published self-contained (carries its own .NET runtime), so this only
# needs to be a Linux host image the platform supports — it does not need
# to match the app's actual .NET version.
resource "azurerm_linux_web_app" "api" {
  name                = local.app_name
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  service_plan_id     = azurerm_service_plan.this.id

  site_config {
    app_command_line = "./ComeRico.Api"
    # F1 doesn't support Always On — the azurerm provider defaults this to
    # true, which Azure rejects on the free tier.
    always_on = false
  }

  app_settings = {
    ASPNETCORE_ENVIRONMENT               = var.environment == "prod" ? "Production" : "Staging"
    ASPNETCORE_URLS                      = "http://0.0.0.0:8080"
    WEBSITES_PORT                        = "8080"
    ConnectionStrings__DefaultConnection = local.database_connection_string
    R2__ServiceUrl                       = local.r2_service_url
    R2__AccessKeyId                      = var.r2_access_key_id
    R2__SecretAccessKey                  = var.r2_secret_access_key
    R2__BucketName                       = cloudflare_r2_bucket.images.name
    R2__PublicBaseUrl                    = local.r2_public_base_url
    CRON_SECRET                          = var.cron_secret
  }
}
