locals {
  r2_service_url     = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
  r2_custom_domain   = "storage-${var.environment}.${var.base_domain}"
  r2_public_base_url = "https://${local.r2_custom_domain}"
}

# R2's S3-compatible credentials are derived from a Cloudflare API token
# scoped to just this bucket, rather than being a separate credential
# type: access_key_id is the token ID, secret_access_key is SHA-256(token
# value) — see developers.cloudflare.com/r2/api/tokens. Generating it here
# (instead of the old manual "R2 > Manage API Tokens" dashboard flow)
# means it's scoped per-bucket automatically and rotates with `terraform
# apply` if ever regenerated.
resource "cloudflare_account_token" "r2_credentials" {
  account_id = var.cloudflare_account_id
  name       = "${local.r2_bucket_name}-s3-credentials"

  policies = [{
    effect = "allow"
    permission_groups = [
      { id = "6a018a9f2fc74eb6b293b0c548f38b39" }, # Workers R2 Storage Bucket Item Read
      { id = "2efd5506f9c8494dacb1fa10a3e7d5b6" }, # Workers R2 Storage Bucket Item Write
    ]
    # "default" is the storage jurisdiction (not the R2 location_hint) —
    # matches the jurisdiction new buckets are created under unless
    # explicitly overridden.
    resources = jsonencode({
      "com.cloudflare.edge.r2.bucket.${var.cloudflare_account_id}_default_${cloudflare_r2_bucket.images.name}" = "*"
    })
  }]
}

locals {
  r2_access_key_id     = cloudflare_account_token.r2_credentials.id
  r2_secret_access_key = sha256(cloudflare_account_token.r2_credentials.value)
}

resource "cloudflare_r2_bucket" "images" {
  account_id = var.cloudflare_account_id
  name       = local.r2_bucket_name
  location   = var.r2_location_hint
}

resource "cloudflare_r2_custom_domain" "images" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.images.name
  zone_id     = var.cloudflare_zone_id
  domain      = local.r2_custom_domain
  enabled     = true
}

resource "cloudflare_r2_bucket_cors" "images" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.images.name

  rules = [{
    allowed = {
      methods = ["GET", "PUT"]
      headers = ["Content-Type", "Content-Length"]
      origins = concat(["https://${var.base_domain}"], var.r2_cors_allowed_origins)
    }
  }]
}

resource "cloudflare_r2_bucket_lifecycle" "images" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.images.name

  rules = [
    # Backstop for upload tickets under staging/ that never get confirmed —
    # CleanupOrphanedFilesCommand already sweeps these after a 2h grace period,
    # this just guarantees storage doesn't accumulate abandoned blobs if that
    # job ever stops running.
    {
      id      = "expire-staging"
      enabled = true
      conditions = {
        prefix = "staging/"
      }
      delete_objects_transition = {
        condition = {
          type    = "Age"
          max_age = 86400
        }
      }
    },
    {

      id      = "abort-incomplete-multipart-uploads"
      enabled = true
      conditions = {
        prefix = ""
      }
      abort_multipart_uploads_transition = {
        condition = {
          type    = "Age"
          max_age = 604800
        }
      }
  }]
}
