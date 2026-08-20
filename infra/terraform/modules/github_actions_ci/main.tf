# GitHub Actions OIDC — lets deploy-backend.yml authenticate to Azure
# without a long-lived secret (azure/login federated credential flow) —
# plus the GitHub-side wiring (Production environment, its vars, and its
# DATABASE_URL secret) that deploy-backend.yml and migrate-database.yml
# read from. Instantiated only for prod — see ../../ci.tf.

locals {
  github_repo_name = split("/", var.github_repository)[1]
}

resource "azuread_application" "github_actions" {
  display_name = "app-${var.workload}-${var.environment}-github-actions"
}

resource "azuread_service_principal" "github_actions" {
  client_id = azuread_application.github_actions.client_id
}

# Subject matches the "Production" GitHub Environment used by
# deploy-backend.yml — not a branch ref — so this credential is scoped to
# runs that went through that environment's protection rules, however
# they're configured.
resource "azuread_application_federated_identity_credential" "github_actions" {
  application_id = azuread_application.github_actions.id
  display_name   = "github-actions-production"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_repository}:environment:Production"
}

# Website Contributor is enough to publish code (what azure/webapps-deploy
# does) without granting control over the plan, networking, or other
# resources in the group.
resource "azurerm_role_assignment" "github_actions_deploy" {
  scope                = var.azure_web_app_id
  role_definition_name = "Website Contributor"
  principal_id         = azuread_service_principal.github_actions.object_id
}

resource "github_repository_environment" "production" {
  repository  = local.github_repo_name
  environment = "Production"
}

resource "github_actions_environment_variable" "azure_client_id" {
  repository    = local.github_repo_name
  environment   = github_repository_environment.production.environment
  variable_name = "AZURE_CLIENT_ID"
  value         = azuread_application.github_actions.client_id
}

resource "github_actions_environment_variable" "azure_tenant_id" {
  repository    = local.github_repo_name
  environment   = github_repository_environment.production.environment
  variable_name = "AZURE_TENANT_ID"
  value         = var.azure_tenant_id
}

resource "github_actions_environment_variable" "azure_subscription_id" {
  repository    = local.github_repo_name
  environment   = github_repository_environment.production.environment
  variable_name = "AZURE_SUBSCRIPTION_ID"
  value         = var.azure_subscription_id
}

resource "github_actions_environment_variable" "azure_webapp_name" {
  repository    = local.github_repo_name
  environment   = github_repository_environment.production.environment
  variable_name = "AZURE_WEBAPP_NAME"
  value         = var.azure_web_app_name
}

# migrate-database.yml's DATABASE_URL — Terraform already computes this
# exact value for the app's own connection string, so it's the source of
# truth instead of a separately hand-maintained secret.
resource "github_actions_environment_secret" "database_url" {
  repository  = local.github_repo_name
  environment = github_repository_environment.production.environment
  secret_name = "DATABASE_URL"
  value       = var.database_connection_string
}
