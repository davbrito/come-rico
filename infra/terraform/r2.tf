# R2 bucket is managed here; the S3-compatible access key/secret pair used
# by the app (r2_access_key_id / r2_secret_access_key) is generated from
# the Cloudflare dashboard under R2 > Manage API Tokens — that credential
# type isn't exposed by the Cloudflare Terraform provider, only the
# account-scoped API tokens used to authenticate this provider itself.
resource "cloudflare_r2_bucket" "images" {
  account_id = var.cloudflare_account_id
  name       = local.r2_bucket_name
  location   = var.r2_location_hint
}

locals {
  r2_service_url = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"

  r2_custom_domain   = "storage-${var.environment}.${var.base_domain}"
  r2_public_base_url = "https://${local.r2_custom_domain}"
}

resource "cloudflare_r2_custom_domain" "images" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.images.name
  zone_id     = var.cloudflare_zone_id
  domain      = local.r2_custom_domain
  enabled     = true
}

# CORS isn't manageable via the Cloudflare provider (bucket-only) — the aws
# provider talks to R2's S3-compatible API instead. See
# https://developers.cloudflare.com/r2/examples/terraform-aws/
resource "aws_s3_bucket_cors_configuration" "images" {
  bucket = cloudflare_r2_bucket.images.name

  cors_rule {
    allowed_origins = concat(["https://${var.base_domain}"], var.r2_cors_allowed_origins)
    allowed_methods = ["GET", "PUT"]
    allowed_headers = ["Content-Type", "Content-Length"]
  }
}

# Backstop for upload tickets under staging/ that never get confirmed —
# CleanupOrphanedFilesCommand already sweeps these after a 2h grace period,
# this just guarantees storage doesn't accumulate abandoned blobs if that
# job ever stops running.
resource "aws_s3_bucket_lifecycle_configuration" "images" {
  bucket = cloudflare_r2_bucket.images.name

  rule {
    id     = "expire-staging"
    status = "Enabled"
    filter {
      prefix = "staging/"
    }
    expiration {
      days = 1
    }
  }

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"
    filter {
      prefix = null
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
