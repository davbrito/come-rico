# Frontend hosting — references the existing Vercel project (created via
# `vercel link`, see .vercel/repo.json) by name rather than importing it as
# a managed resource. A data source can't accidentally overwrite framework/
# build settings on apply, unlike `resource + terraform import` where any
# attribute this config doesn't happen to match exactly would drift back.
#
# No team_id needed — vercel_api_token is a team-scoped token, so the
# provider/resources resolve it from that.

variable "vercel_project_name" {
  type    = string
  default = "come-rico"
}

data "vercel_project" "frontend" {
  name = var.vercel_project_name
}

# Authoritative — any env var not listed here is removed on apply. The
# project used to also carry backend env vars (R2__*, CRON_SECRET,
# ConnectionStrings__DefaultConnection) from when the .NET backend
# deployed to Vercel; those are dead since the Azure migration.
#
# TanStack Start's SSR calls the backend directly during beforeLoad (see
# frontend/src/lib/api.ts) — BACKEND_URL is that path; the
# vercel_project_route below covers the browser path.
resource "vercel_project_environment_variables" "frontend" {
  project_id = data.vercel_project.frontend.id

  variables = [
    {
      key       = "BACKEND_URL"
      value     = "https://${azurerm_linux_web_app.api.default_hostname}"
      target    = ["production"]
      sensitive = false
    },
  ]
}

# Toggle only — the cron schedule itself is still declared in vercel.json
# (Vercel has no API to define individual cron jobs outside deployment
# config; this resource just enables/disables cron execution project-wide).
resource "vercel_project_crons" "frontend" {
  project_id = data.vercel_project.frontend.id
  enabled    = true
}

# Live project-level routing rule (promoted immediately, independent of
# deployments) — moved out of vercel.json so it's Terraform-managed
# alongside the backend it points at. The frontend's own service-routing
# catch-all ("/(.*)" -> service frontend) stays in vercel.json: that's tied
# to the monorepo "services" build config, not an ordinary rewrite this
# API can express.
resource "vercel_project_route" "api_rewrite" {
  project_id = data.vercel_project.frontend.id
  name       = "api-rewrite"

  # Omitting this entirely crashes the provider (v5.12.0) — its validator
  # panics on a nil position rather than treating it as truly optional.
  position = {
    placement = "start"
  }

  # dest must be a plain literal — the provider's static config validator
  # (v5.12.0) treats ANY interpolated value here, even a fully-static
  # local, as "not set" and errors ("Missing route action"); only a bare
  # string literal survives it. Safe to hardcode regardless: app_name is
  # stable (app_name_unique_suffix = false in prod), same as vercel.json's
  # old static rewrite was. Keep this in sync by hand if that ever changes.
  route = {
    src  = "/api/(.*)"
    dest = "https://app-come-rico-prod.azurewebsites.net/api/$1"
  }
}

resource "vercel_project_domain" "frontend" {
  project_id = data.vercel_project.frontend.id
  domain     = var.base_domain
}
