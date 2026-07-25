terraform {
  required_version = ">= 1.10" # native S3 state locking (use_lockfile), no DynamoDB table needed

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Bucket/region are provided at `terraform init` time via -backend-config
  # (see README.md) — created once by infra/aws/bootstrap/, which itself
  # uses local state (there's no bucket yet to store it in).
  backend "s3" {
    key          = "come-rico/aws.tfstate"
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "come-rico"
      ManagedBy = "terraform"
    }
  }
}
