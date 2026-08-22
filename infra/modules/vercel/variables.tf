variable "vercel_project_name" {
  type    = string
  default = "come-rico"
}

variable "github_repository" {
  description = "GitHub \"owner/repo\" the Vercel project's Git integration deploys from. Set once, in ../../root.hcl's shared inputs."
  type        = string
}

variable "base_domain" {
  type = string
}

variable "prod_backend_url" {
  description = "Prod backend's URL (https://...), from ../../live/prod via a Terragrunt dependency block. Used for the production Vercel deployment (host == var.base_domain)."
  type        = string
}

variable "dev_backend_url" {
  description = "Dev backend's URL (https://...), from ../../live/dev via a Terragrunt dependency block. Used as the staging target for every other Vercel deployment (previews, and the default *.vercel.app alias)."
  type        = string
}

variable "infisical_project_id" {
  description = "Infisical project ID holding come-rico's provider tokens."
  type        = string
}
