include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "../../stack"
}

dependency "platform" {
  config_path = "../platform/aws-oidc"

  mock_outputs = {
    provider_arn = "arn:aws:iam::000000000000:oidc-provider/token.actions.githubusercontent.com"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan", "init"]
}

inputs = {
  environment       = "dev"
  oidc_provider_arn = dependency.platform.outputs.provider_arn
  # Dev is now also the staging target every Vercel preview deployment's
  # API rewrite points at (../platform/vercel, via a Terragrunt
  # `dependency` on this unit's app_hostname output) — a stable name here
  # just makes for a nicer, predictable staging URL, same as prod.
  app_name_unique_suffix = false

  github_environment_name = "Development"
}
