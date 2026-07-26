# ---------------------------------------------------------------------------
# Image storage — Cloudflare R2
#
# The Worker itself is NOT managed here. Its build output is 48 ES modules
# plus a static-assets directory, which is wrangler's job — see the note in
# README.md. Terraform owns infrastructure; wrangler ships the Worker, the
# same way `az webapp deploy` ships the backend binary.
# ---------------------------------------------------------------------------

resource "cloudflare_r2_bucket" "images" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-${var.stage}-images"
}
