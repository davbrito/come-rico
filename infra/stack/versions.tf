terraform {
  # >= 1.10 for ephemeral resources (infisical.tf) — used so provider
  # tokens never get written to state.
  required_version = ">= 1.10"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5"
    }
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.15"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 5"
    }
    infisical = {
      source  = "infisical/infisical"
      version = "~> 0.15"
    }
  }

  # No backend block here — Terragrunt generates it per environment (see
  # infra/terragrunt/terragrunt.hcl#remote_state). This module is never
  # applied directly; always run through `terragrunt` in
  # infra/terragrunt/live/<env>/.
}

provider "azurerm" {
  features {}
}

provider "azuread" {}

provider "neon" {
  api_key = ephemeral.infisical_secret.neon_api_key.value
}

provider "cloudflare" {
  api_token = ephemeral.infisical_secret.cloudflare_api_token.value
}

# No token configured — the provider picks it up from the gh CLI's stored
# auth (`gh auth login`) automatically.
provider "github" {
  owner = local.github_owner
}


provider "vercel" {
  api_token = ephemeral.infisical_secret.vercel_api_token.value
}

# Infisical itself — authenticates via Universal Auth machine identity,
# picked up automatically from INFISICAL_UNIVERSAL_AUTH_CLIENT_ID /
# _CLIENT_SECRET (see .envrc, direnv-loaded — not a tfvars value).
provider "infisical" {}
