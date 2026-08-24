# Single Vercel project ("come-rico") — the frontend. Not per-environment
# itself, but its traffic is: the production deployment (host ==
# var.base_domain) talks to prod's backend, every other deployment
# (previews, and the default *.vercel.app alias) talks to dev's, as a
# staging target. Lives here, not in stack, for the same reason
# ../aws_oidc's provider does: if this were in stack, both dev's
# and prod's applies would fight over the same Vercel project's env
# vars/crons/domain, since Vercel doesn't have a per-environment project
# here the way Azure/Neon/R2 do.
#
# References the existing Vercel project (created via `vercel link`, see
# .vercel/repo.json) by name rather than importing it as a managed
# resource — a data source can't accidentally overwrite framework/build
# settings on apply, unlike `resource + terraform import` where any
# attribute this config doesn't happen to match exactly would drift back.
#
# No team_id needed — the Infisical-sourced Vercel token is team-scoped,
# so the provider/resources resolve it from that.
#
# var.prod_backend_url/var.dev_backend_url come from ../../live/prod and
# ../../live/dev's `app_hostname` outputs via Terragrunt `dependency`
# blocks in ../../live/platform/vercel/terragrunt.hcl — not computed here,
# and not the other way around (prod/dev depending on this unit) since
# both already depend on ../aws_oidc and that would make a cycle
# between the same two units.


data "vercel_project" "frontend" {
  name = var.vercel_project_name
}

locals {
  vercel_envs = {
    production = {
      backend_url = var.prod_backend_url
    }
    preview = {
      backend_url = var.dev_backend_url
    }
  }
}

# The browser's copy of the same URL — VITE_-prefixed so Vite inlines it
# into the client bundle at build time (frontend/src/lib/api.ts). Needed
# because the browser now calls the Lambda Function URL directly
# (cross-origin, via CORS) instead of a same-origin Vercel rewrite.
resource "vercel_project_environment_variable" "public_backend_url" {
  for_each   = local.vercel_envs
  project_id = data.vercel_project.frontend.id
  key        = "PUBLIC_BACKEND_URL"
  value      = each.value.backend_url
  target     = [each.key]
  sensitive  = false
}

# Toggle only — the cron schedule itself is still declared in vercel.json
# (Vercel has no API to define individual cron jobs outside deployment
# config; this resource just enables/disables cron execution project-wide).
resource "vercel_project_crons" "frontend" {
  project_id = data.vercel_project.frontend.id
  enabled    = true
}

resource "vercel_project_domain" "frontend" {
  project_id = data.vercel_project.frontend.id
  domain     = var.base_domain
}
