terraform {
  # No backend block — Terragrunt generates it (see
  # ../../live/platform/terragrunt.hcl and ../../root.hcl).
  required_version = ">= 1.10"

  required_providers {
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3"
    }
  }
}

provider "azuread" {}
