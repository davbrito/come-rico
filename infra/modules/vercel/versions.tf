terraform {
  # >= 1.10 for ephemeral resources (infisical.tf) — used so provider
  # tokens never get written to state.
  required_version = ">= 1.10"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 5"
    }
    infisical = {
      source  = "infisical/infisical"
      version = "~> 0.15"
    }
  }

  # No backend block here — Terragrunt generates it (see
  # ../../live/platform/vercel/terragrunt.hcl and ../../root.hcl).
}

provider "vercel" {}

# Infisical itself — authenticates via Universal Auth machine identity,
# picked up automatically from INFISICAL_UNIVERSAL_AUTH_CLIENT_ID /
# _CLIENT_SECRET (see ../../.envrc, direnv-loaded).
provider "infisical" {}
