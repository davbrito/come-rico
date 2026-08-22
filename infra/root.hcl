# Root Terragrunt config, included by every infra/live/<env>/terragrunt.hcl.
# Holds everything that's identical across environments —
# the remote state backend and the handful of inputs that don't vary by
# env — so live/<env>/terragrunt.hcl only needs to declare what actually
# differs (environment, app_name_unique_suffix, ...).

locals {
  cloudflare_account_id = get_env("CLOUDFLARE_ACCOUNT_ID")
}

# Same R2 bucket infra/stack used directly before (see its README's old
# "Remote state" section) — one bucket, one state file per environment via
# path_relative_to_include() (resolves to "live/dev" / "live/prod").
# Credentials are R2 API token creds, kept out of version control the same
# way backend.hcl used to (see .envrc.example, this directory) — there's
# no backend.hcl file anymore, Terragrunt generates the whole backend
# block per unit instead.
remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket = "come-rico-tfstate"
    key    = "${path_relative_to_include()}/terraform.tfstate"
    region = "auto"

    access_key = get_env("R2_TFSTATE_ACCESS_KEY_ID")
    secret_key = get_env("R2_TFSTATE_SECRET_ACCESS_KEY")
    endpoints = {
      s3 = "https://${local.cloudflare_account_id}.r2.cloudflarestorage.com"
    }

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}

# Shared across every environment — see .envrc.example. Anything that
# genuinely varies by environment (environment, app_name_unique_suffix)
# stays in live/<env>/terragrunt.hcl instead of here.
inputs = {
  base_domain           = "comerico.davbrito.dev"
  cloudflare_account_id = local.cloudflare_account_id
  cloudflare_zone_id    = get_env("CLOUDFLARE_ZONE_ID")
  infisical_project_id  = get_env("INFISICAL_PROJECT_ID")
}
