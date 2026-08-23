include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "../../stack"
}

dependency "platform" {
  config_path = "../platform/ci"

  mock_outputs = {
    client_id      = "00000000-0000-0000-0000-000000000000"
    application_id = "00000000-0000-0000-0000-000000000000"
    principal_id   = "00000000-0000-0000-0000-000000000000"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan", "init"]
}

# The subscription caps Container App Environments at 1 total, so dev and
# prod share the one ../platform/container-apps-environment provisions —
# see that unit's comment and stack/variables.tf's
# container_apps_environment_id description.
dependency "container_apps_environment" {
  config_path = "../platform/container-apps-environment"

  mock_outputs = {
    environment_id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mock/providers/Microsoft.App/managedEnvironments/mock"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan", "init"]
}

inputs = {
  environment                   = "dev"
  container_apps_environment_id = dependency.container_apps_environment.outputs.environment_id
  # Dev is now also the staging target every Vercel preview deployment's
  # API rewrite points at (../platform/vercel, via a Terragrunt
  # `dependency` on this unit's app_hostname output) — a stable hostname
  # here just makes for a nicer, predictable staging URL, same as prod.
  app_name_unique_suffix = false

  github_environment_name       = "Development"
  github_actions_client_id      = dependency.platform.outputs.client_id
  github_actions_application_id = dependency.platform.outputs.application_id
  github_actions_principal_id   = dependency.platform.outputs.principal_id
}
