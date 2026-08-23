# Externally-issued secrets that Terraform can't generate itself land in
# Infisical, per environment. Nothing currently reads from this data
# source — the AWS Lambda migration dropped the one thing that used to
# (GHCR_PAT, a registry pull credential Container Apps needed that has no
# Lambda equivalent, since zip deploys don't pull from a registry) — but
# it's kept wired up for whatever's added next, rather than torn out and
# re-added later.
data "infisical_secrets" "this" {
  env_slug     = var.environment
  workspace_id = var.infisical_project_id
  folder_path  = "/"
}
