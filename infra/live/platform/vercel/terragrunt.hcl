# The one Vercel project ("come-rico"), shared across environments —
# there's a single frontend, but it routes to different backends
# depending on which Vercel deployment is serving the request:
# production (the base_domain custom domain) -> prod's backend, every
# other host (previews) -> dev's, as a staging target. See
# ../../../modules/vercel/vercel.tf.
#
# Depends on live/prod (and live/dev) for their backend hostnames — the
# reverse of ../ci, which live/dev and live/prod both depend on. Keeping
# these as two separate units under live/platform avoids a cycle: this
# unit -> live/prod -> ../ci, never back to this unit.

include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "../../../modules/vercel"
}

dependency "prod" {
  config_path = "../../prod"

  mock_outputs = {
    app_url = "https://mock-prod.lambda-url.us-east-1.on.aws/"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan", "init"]
}

dependency "dev" {
  config_path = "../../dev"

  mock_outputs = {
    app_url = "https://mock-dev.lambda-url.us-east-1.on.aws/"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan", "init"]
}

inputs = {
  # app_url is already a full URL (the Lambda Function URL) — unlike the
  # old Azure App Service/Container Apps hostname outputs, no "https://"
  # prefix needed here.
  prod_backend_url = dependency.prod.outputs.app_url
  dev_backend_url  = dependency.dev.outputs.app_url
}
