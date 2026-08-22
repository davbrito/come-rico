# Single Vercel project ("come-rico") — the frontend. Not per-environment
# itself, but its traffic is: the production deployment (host ==
# var.base_domain) talks to prod's backend, every other deployment
# (previews, and the default *.vercel.app alias) talks to dev's, as a
# staging target. Lives here, not in stack, for the same reason
# ../github_actions_ci's identity does: if this were in stack, both dev's
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
# both already depend on ../github_actions_ci and that would make a cycle
# between the same two units.


resource "vercel_project" "frontend" {
  name = var.vercel_project_name

  git_repository = {
    type = "github"
    repo = var.github_repository
  }
  node_version = "24.x"
  framework    = "services"
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

# Authoritative — any env var not listed here is removed on apply. The
# project used to also carry backend env vars (R2__*, CRON_SECRET,
# ConnectionStrings__DefaultConnection) from when the .NET backend
# deployed to Vercel; those are dead since the Azure migration.
#
# TanStack Start's SSR calls the backend directly during beforeLoad (see
# frontend/src/lib/api.ts) — BACKEND_URL is that path; the
# vercel_project_route rules below cover the browser path, with the same
# prod/preview split.
resource "vercel_project_environment_variable" "backend_url" {
  for_each   = local.vercel_envs
  project_id = vercel_project.frontend.id
  key        = "BACKEND_URL"
  value      = each.value.backend_url
  target     = [each.key]
  sensitive  = false
}


# Toggle only — the cron schedule itself is still declared in vercel.json
# (Vercel has no API to define individual cron jobs outside deployment
# config; this resource just enables/disables cron execution project-wide).
resource "vercel_project_crons" "frontend" {
  project_id = vercel_project.frontend.id
  enabled    = true
}

# Live project-level routing rules (promoted immediately, independent of
# deployments) — Terraform-managed alongside the backends they point at.
# The frontend's own service-routing catch-all ("/(.*)" -> service
# frontend) stays in vercel.json: that's tied to the monorepo "services"
# build config, not an ordinary rewrite this API can express.
#
# Two rules, evaluated in order: the production-host-specific one first,
# then an unconditional fallback for everything else (previews, the
# default *.vercel.app alias).
#
# `dest` (only `dest` — `has.value` above is fine interpolated) must be a
# plain literal: confirmed by `terraform validate` actually failing
# ("Missing route action" — treats any interpolated value, even a
# fully-static var/local, as unset) when it was
# `"${var.prod_backend_url}/api/$1"`, not just a theoretical provider
# quirk. Safe to hardcode regardless: both hostnames are stable
# (app_name_unique_suffix = false in both prod and dev, see
# ../../stack/README.md#naming and ../../live/dev/terragrunt.hcl) — same
# values var.prod_backend_url/var.dev_backend_url resolve to. Keep these
# in sync by hand if either naming convention ever changes.
resource "vercel_project_route" "api_rewrite_production" {
  project_id = vercel_project.frontend.id
  name       = "api-rewrite-production"

  # Omitting this entirely crashes the provider (v5.12.0) — its validator
  # panics on a nil position rather than treating it as truly optional.
  position = {
    placement = "start"
  }

  route = {
    src = "/api/(.*)"
    has = [{
      type  = "host"
      value = var.base_domain
    }]
    dest = "https://app-come-rico-prod.azurewebsites.net/api/$1"
  }
}

resource "vercel_project_route" "api_rewrite_preview" {
  project_id = vercel_project.frontend.id
  name       = "api-rewrite-preview"

  position = {
    placement          = "after"
    reference_route_id = vercel_project_route.api_rewrite_production.id
  }

  route = {
    src  = "/api/(.*)"
    dest = "https://app-come-rico-dev.azurewebsites.net/api/$1"
  }
}

resource "vercel_project_domain" "frontend" {
  project_id = vercel_project.frontend.id
  domain     = var.base_domain
}
