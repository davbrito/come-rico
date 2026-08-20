# https://neon.com/docs/reference/terraform

# One Neon project per environment — keeps prod/staging/dev fully isolated
# (separate compute, separate billing line item on Neon's free tier).
resource "neon_project" "this" {
  name       = "${var.workload}-${var.environment}"
  region_id  = var.neon_region_id
  pg_version = var.neon_pg_version

  history_retention_seconds = 86400 # 1 day, free-tier default
}

locals {
  # ADO.NET keyword=value format — the app reads ConnectionStrings:DefaultConnection
  # directly and does no URI parsing.
  database_connection_string = "Host=${neon_project.this.database_host};Port=5432;Database=${neon_project.this.database_name};Username=${neon_project.this.database_user};Password=${neon_project.this.database_password};Sslmode=Require"
}
