locals {
  # Applied to every azurerm resource in this stack (see each resource's
  # `tags = local.azure_tags`) — add a new tag here once and every
  # resource picks it up, instead of repeating it per-resource.
  azure_tags = {
    project     = "come-rico"
    environment = var.environment
    managed_by  = "terraform"
  }
}

data "azurerm_client_config" "current" {}

# Generated instead of hand-rolled — this is an arbitrary shared secret
# (not tied to any third-party account like the other provider tokens),
# so there's nothing to fetch from Infisical; Terraform can just create
# it. Mirrored into Infisical (infisical.tf) so it's discoverable outside
# this Terraform run, same as the R2 credentials in r2.tf.
resource "random_password" "cron_secret" {
  length  = 32
  special = false
}

resource "azurerm_resource_group" "this" {
  name     = local.resource_group_name
  location = var.azure_location
  tags     = local.azure_tags
}

resource "azurerm_container_app" "api" {
  name = local.container_app_name
  # Shared across every environment — this subscription caps Container
  # App Environments at 1 per subscription, so it can't be provisioned
  # here per-environment like the App Service Plan it replaced was. See
  # ../modules/container_apps_environment and var.container_apps_environment_id's
  # description.
  container_app_environment_id = var.container_apps_environment_id
  resource_group_name          = azurerm_resource_group.this.name
  revision_mode                = "Single"
  tags                         = local.azure_tags

  ingress {
    external_enabled = true
    target_port      = 8080
    transport        = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  # GHCR pull credential — GITHUB_TOKEN (used by deploy-backend.yml to
  # push) expires with the workflow run, so runtime pulls need a
  # longer-lived PAT instead.
  secret {
    name  = "ghcr-pat"
    value = local.ghcr_pat
  }

  registry {
    server               = "ghcr.io"
    username             = var.ghcr_owner
    password_secret_name = "ghcr-pat"
  }

  # Everything credential-shaped goes through a Container App secret
  # (referenced from `env` via `secret_name`) instead of a plain `env.value`
  # — keeps these out of the revision's visible env list in the portal/CLI,
  # unlike App Service's app_settings where there was no such split. They
  # still land in Terraform state either way, same as every other secret in
  # this stack (see infisical.tf's comment on that tradeoff).
  secret {
    name  = "appinsights-connection-string"
    value = azurerm_application_insights.api.connection_string
  }
  secret {
    name  = "appinsights-instrumentation-key"
    value = azurerm_application_insights.api.instrumentation_key
  }
  secret {
    name  = "db-connection-string"
    value = local.database_connection_string
  }
  secret {
    name  = "r2-access-key-id"
    value = local.r2_access_key_id
  }
  secret {
    name  = "r2-secret-access-key"
    value = local.r2_secret_access_key
  }
  secret {
    name  = "cron-secret"
    value = random_password.cron_secret.result
  }

  template {
    container {
      name = "api"
      # Public placeholder — only seeds the *first* revision. Terraform
      # can't seed the real ghcr.io/<owner>/<repo>-backend image here: on
      # a from-scratch environment nothing has pushed it yet (chicken-and-
      # egg — deploy-backend.yml's `az containerapp update --image` needs
      # this Container App to already exist), and Azure fails the create
      # outright ("MANIFEST_UNKNOWN") if the image doesn't exist, unlike a
      # failing health probe. `lifecycle.ignore_changes` below means
      # Terraform never looks at this again after creation — the very
      # first deploy-backend.yml run replaces it with the real image.
      image  = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
      cpu    = 0.25
      memory = "0.5Gi"

      # /health (app.MapHealthChecks in Program.cs) — pings DB connectivity
      # too via AddDbContextCheck.
      liveness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 8080
      }

      readiness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 8080
      }

      env {
        name  = "ASPNETCORE_ENVIRONMENT"
        value = var.environment == "prod" ? "Production" : "Staging"
      }
      env {
        name  = "ASPNETCORE_URLS"
        value = "http://+:8080"
      }
      # Read by Azure.Monitor.OpenTelemetry.AspNetCore's UseAzureMonitor()
      # in Program.cs by convention — reports requests, dependencies,
      # exceptions, and ILogger traces to Application Insights.
      env {
        name        = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        secret_name = "appinsights-connection-string"
      }
      env {
        name        = "APPINSIGHTS_INSTRUMENTATIONKEY"
        secret_name = "appinsights-instrumentation-key"
      }
      env {
        name        = "ConnectionStrings__DefaultConnection"
        secret_name = "db-connection-string"
      }
      env {
        name  = "R2__ServiceUrl"
        value = local.r2_service_url
      }
      env {
        name        = "R2__AccessKeyId"
        secret_name = "r2-access-key-id"
      }
      env {
        name        = "R2__SecretAccessKey"
        secret_name = "r2-secret-access-key"
      }
      env {
        name  = "R2__BucketName"
        value = cloudflare_r2_bucket.images.name
      }
      env {
        name  = "R2__PublicBaseUrl"
        value = local.r2_public_base_url
      }
      env {
        name        = "CRON_SECRET"
        secret_name = "cron-secret"
      }
    }
  }

  lifecycle {
    # deploy-backend.yml moves the image via `az containerapp update`
    # outside Terraform — don't fight it back to :latest on every apply.
    ignore_changes = [template[0].container[0].image]
  }
}
