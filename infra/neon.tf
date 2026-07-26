# ---------------------------------------------------------------------------
# Database — Neon (free tier)
#
# Community provider (kislerdm/neon), not officially supported by Neon.
# Nothing at runtime depends on it; worst case is managing Neon from the
# console and feeding the connection string in as a variable instead.
# ---------------------------------------------------------------------------

resource "neon_project" "main" {
  name = "${var.project_name}-${var.stage}"

  branch {
    name          = "main"
    database_name = "comerico"
    role_name     = "comerico"
  }
}

locals {
  # The backend reads ConnectionStrings:DefaultConnection and does NO URI
  # parsing, so this must be assembled in ADO.NET keyword=value form — a
  # postgres:// URL will not work.
  connection_string = join(";", [
    "Host=${neon_project.main.database_host}",
    "Port=5432",
    "Database=${neon_project.main.database_name}",
    "Username=${neon_project.main.database_user}",
    "Password=${neon_project.main.database_password}",
    "SSL Mode=Require",
    "Trust Server Certificate=true",
  ])
}
