# Externally-issued secrets that Terraform can't generate itself land in
# Infisical, per environment. Read by lambda.tf:
#   WORKOS_API_KEY, WORKOS_CLIENT_ID — WorkOS AuthKit (see ../workos.md)
data "infisical_secrets" "this" {
  env_slug     = var.environment
  workspace_id = var.infisical_project_id
  folder_path  = "/"
}
