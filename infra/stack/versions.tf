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
    infisical = {
      source  = "infisical/infisical"
      version = "~> 0.15"
    }
  }

  # No backend block here — Terragrunt generates it per environment (see
  # ../root.hcl#remote_state). This module is never applied directly;
  # always run through `terragrunt` in ../live/<env>/.
}

provider "azurerm" {
  features {}
}

provider "azuread" {}

# No token configured — the provider picks it up from the gh CLI's stored
# auth (`gh auth login`) automatically.
provider "github" {
  owner = split("/", var.github_repository)[0]
}

provider "neon" {}

provider "cloudflare" {}

provider "infisical" {}
