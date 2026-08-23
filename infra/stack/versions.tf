terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
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
    github = {
      source  = "integrations/github"
      version = "~> 6"
    }
    infisical = {
      source  = "infisical/infisical"
      version = "~> 0.15"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2"
    }
  }

  # No backend block here — Terragrunt generates it per environment (see
  # ../root.hcl#remote_state). This module is never applied directly;
  # always run through `terragrunt` in ../live/<env>/.
}

provider "aws" {
  region = var.aws_region
}

# No token configured — the provider picks it up from the gh CLI's stored
# auth (`gh auth login`) automatically.
provider "github" {
  owner = split("/", var.github_repository)[0]
}

provider "neon" {}

provider "cloudflare" {}

provider "infisical" {}
