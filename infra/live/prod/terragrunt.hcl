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
  environment       = "prod"
  oidc_provider_arn = dependency.platform.outputs.provider_arn
  # Stable name once come-rico-prod is confirmed free — CI deploys
  # reference AWS_LAMBDA_FUNCTION_NAME by fixed value, not a Terraform
  # output, so prod shouldn't carry a random suffix.
  app_name_unique_suffix = false

  github_environment_name = "Production"

  # Require manual approval before deploy-backend.yml or migrate-database.yml
  # can run against Production — otherwise anyone with repo write access can
  # push migrations/deploys straight to prod with no review. GitHub user ID
  # for davbrito (not the username — the API/provider wants the numeric id).
  github_environment_reviewer_user_ids = [39559632]
}
