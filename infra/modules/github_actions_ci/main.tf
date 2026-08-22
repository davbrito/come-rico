# A single Azure AD app + service principal, shared across every
# environment's GitHub Actions deploys (dev and prod both authenticate as
# this identity). Deliberately its own Terragrunt unit
# (../../live/platform) rather than living inside any one environment's
# stack — everything environment-specific (the federated credential per
# GitHub Environment, the Website Contributor role assignment scoped to
# that environment's web app, and the GitHub Environment variables/secrets
# themselves) lives in ../../stack/ci.tf instead, which pulls this
# identity's client_id/application_id/principal_id in via a Terragrunt
# `dependency` block from ../../live/dev and ../../live/prod.

resource "azuread_application" "github_actions" {
  display_name = "app-${var.workload}-github-actions"
}

resource "azuread_service_principal" "github_actions" {
  client_id = azuread_application.github_actions.client_id
}
