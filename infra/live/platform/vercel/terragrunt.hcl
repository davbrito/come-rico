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
    app_hostname = "mock-app-come-rico-prod.azurewebsites.net"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan", "init"]
}

dependency "dev" {
  config_path = "../../dev"

  mock_outputs = {
    app_hostname = "mock-app-come-rico-dev.azurewebsites.net"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan", "init"]
}

inputs = {
  prod_backend_url = "https://${dependency.prod.outputs.app_hostname}"
  dev_backend_url  = "https://${dependency.dev.outputs.app_hostname}"
}
