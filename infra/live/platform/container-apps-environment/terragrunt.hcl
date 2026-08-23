# A single Container Apps Environment, shared by every environment's
# Container App — this subscription caps Container App Environments at 1
# per subscription (MaxNumberOfGlobalEnvironmentsInSubExceeded), so it
# can't live inside live/dev or live/prod's own state. See
# ../../../modules/container_apps_environment/main.tf.

include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "../../../modules/container_apps_environment"
}

dependency "ci" {
  config_path = "../ci"

  mock_outputs = {
    principal_id = "00000000-0000-0000-0000-000000000000"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan", "init"]
}

inputs = {
  github_actions_principal_id = dependency.ci.outputs.principal_id
}
