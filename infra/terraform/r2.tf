locals {
  r2_service_url     = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
  r2_custom_domain   = "storage-${var.environment}.${var.base_domain}"
  r2_public_base_url = "https://${local.r2_custom_domain}"
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
