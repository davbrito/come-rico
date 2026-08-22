include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "../../stack"
}

dependency "platform" {
  config_path = "../platform"

  mock_outputs = {
    client_id      = "00000000-0000-0000-0000-000000000000"
    application_id = "00000000-0000-0000-0000-000000000000"
    principal_id   = "00000000-0000-0000-0000-000000000000"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan", "init"]
}

inputs = {
  environment = "dev"

  github_environment_name       = "Development"
  github_actions_client_id      = dependency.platform.outputs.client_id
  github_actions_application_id = dependency.platform.outputs.application_id
  github_actions_principal_id   = dependency.platform.outputs.principal_id
}
