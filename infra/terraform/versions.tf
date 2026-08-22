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

  # State lives in Cloudflare R2 (S3-compatible), not locally — see
  # README.md#remote-state. bucket/key are fixed and non-sensitive, so they
  # stay here; access_key/secret_key/endpoints are account-specific and
  # supplied at init time via -backend-config=backend.hcl (gitignored, see
  # backend.hcl.example). Workspaces (dev/default) get separate state paths
  # automatically under this bucket.
  backend "s3" {
    bucket                      = "come-rico-tfstate"
    key                         = "terraform.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
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
