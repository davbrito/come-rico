terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4"
    }
  }

  # No backend block here — Terragrunt generates it (see
  # ../../live/platform/aws-oidc/terragrunt.hcl and ../../root.hcl).
}

provider "aws" {}
