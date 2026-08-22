include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "../../stack"
}

inputs = {
  environment = "prod"
  # Stable hostname once app-come-rico-prod is confirmed free — CI deploys
  # reference AZURE_WEBAPP_NAME by fixed value, not a Terraform output, so
  # prod shouldn't carry a random suffix.
  app_name_unique_suffix = false
}
