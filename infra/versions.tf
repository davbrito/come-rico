terraform {
  required_version = ">= 1.10"

  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
      # >= 5.11 ships native Workers static-assets upload, which is what
      # lets Terraform deploy the full-stack Worker without wrangler.
      version = "~> 5.14"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    neon = {
      # Community provider — not officially supported by Neon.
      source  = "kislerdm/neon"
      version = "~> 0.9"
    }
  }

  # State lives in R2, which is S3-compatible — keeps everything on
  # Cloudflare with no AWS account and no extra cost. Bucket and
  # credentials are supplied at init time via -backend-config; see
  # infra/README.md.
  backend "s3" {
    key = "come-rico/terraform.tfstate"

    region                      = "auto"
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

provider "azurerm" {
  features {}
  subscription_id = var.azure_subscription_id
}

provider "neon" {
  api_key = var.neon_api_key
}
