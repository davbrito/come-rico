# Everything environment-specific about GitHub Actions deploys: the
# federated credential scoped to this environment's GitHub Environment,
# the Website Contributor role assignment scoped to this environment's own
# web app (kept in the same state as that web app, not passed around as a
# bare ID string), and the GitHub Environment itself with its vars/secret.
#
# The identity these all point at (client_id/application_id/principal_id)
# is shared across every environment — see ../modules/github_actions_ci —
# and comes in via a Terragrunt `dependency` block from
# ../live/<env>/terragrunt.hcl, not managed here.

variable "github_repository" {
  description = "GitHub \"owner/repo\" this environment's CI is allowed to deploy from. Set once, in ../root.hcl's shared inputs."
  type        = string
}

variable "github_environment_name" {
  description = "GitHub Environment name deploy-backend.yml/migrate-database.yml run under for this environment (e.g. \"Production\", \"Development\") — also what the OIDC federated credential's subject is scoped to."
  type        = string
}

variable "github_actions_client_id" {
  description = "Shared CI identity's client ID — from ../live/<env>/terragrunt.hcl's dependency on ../live/platform."
  type        = string
}

variable "github_actions_application_id" {
  description = "Shared CI identity's application (object) ID — from ../live/<env>/terragrunt.hcl's dependency on ../live/platform."
  type        = string
}

variable "github_actions_principal_id" {
  description = "Shared CI identity's service principal object ID — from ../live/<env>/terragrunt.hcl's dependency on ../live/platform."
  type        = string
}

locals {
  github_repo_name = split("/", var.github_repository)[1]
}

# Subject matches this environment's GitHub Environment — not a branch
# ref — so this credential is scoped to runs that went through that
# environment's protection rules, however they're configured.
resource "azuread_application_federated_identity_credential" "github_actions" {
  application_id = var.github_actions_application_id
  display_name   = "github-actions-${var.environment}"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_repository}:environment:${var.github_environment_name}"
}

# Website Contributor is enough to publish code (what azure/webapps-deploy
# does) without granting control over the plan, networking, or other
# resources in the group.
resource "azurerm_role_assignment" "github_actions_deploy" {
  scope                = azurerm_linux_web_app.api.id
  role_definition_name = "Website Contributor"
  principal_id         = var.github_actions_principal_id
}

resource "github_repository_environment" "this" {
  repository  = local.github_repo_name
  environment = var.github_environment_name
}

resource "github_actions_environment_variable" "azure_client_id" {
  repository    = local.github_repo_name
  environment   = github_repository_environment.this.environment
  variable_name = "AZURE_CLIENT_ID"
  value         = var.github_actions_client_id
}

resource "github_actions_environment_variable" "azure_tenant_id" {
  repository    = local.github_repo_name
  environment   = github_repository_environment.this.environment
  variable_name = "AZURE_TENANT_ID"
  value         = data.azurerm_client_config.current.tenant_id
}

resource "github_actions_environment_variable" "azure_subscription_id" {
  repository    = local.github_repo_name
  environment   = github_repository_environment.this.environment
  variable_name = "AZURE_SUBSCRIPTION_ID"
  value         = data.azurerm_client_config.current.subscription_id
}

resource "github_actions_environment_variable" "azure_webapp_name" {
  repository    = local.github_repo_name
  environment   = github_repository_environment.this.environment
  variable_name = "AZURE_WEBAPP_NAME"
  value         = azurerm_linux_web_app.api.name
}

# migrate-database.yml's connection string. Named to match the
# ConnectionStrings:DefaultConnection config key via the double-underscore
# env var convention — the app (and `dotnet ef`, which bootstraps the same
# way) only ever reads that key, never a DATABASE_URL-style var, so the
# secret name has to match exactly or migrations silently connect to
# whatever's in appsettings.json instead.
resource "github_actions_environment_secret" "database_url" {
  repository  = local.github_repo_name
  environment = github_repository_environment.this.environment
  secret_name = "ConnectionStrings__DefaultConnection"
  value       = local.database_connection_string
}
