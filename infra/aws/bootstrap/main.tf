# One-time setup: creates the S3 bucket that infra/aws/'s `backend "s3"`
# block uses for remote state. Chicken-and-egg — this module has nowhere to
# store *its own* state remotely, so it deliberately stays on local state
# (a single small bucket resource; low risk of drift).
#
# Run once per AWS account/environment:
#   cd infra/aws/bootstrap && terraform init && terraform apply
# Then wire the bucket name into infra/aws's backend config (see README.md).

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "bucket_prefix" {
  type    = string
  default = "come-rico-tfstate-"
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

resource "aws_s3_bucket" "tfstate" {
  bucket_prefix = var.bucket_prefix

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "state_bucket" {
  value = aws_s3_bucket.tfstate.id
}
