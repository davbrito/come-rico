terraform {
  # No backend block — Terragrunt generates it (see
  # ../../live/platform/container-apps-environment/terragrunt.hcl and
  # ../../root.hcl).
  required_version = ">= 1.10"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5"
    }
  }
}

provider "azurerm" {
  features {}
}
