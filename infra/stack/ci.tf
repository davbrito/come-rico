# Everything environment-specific about GitHub Actions deploys: the IAM
# role and its trust policy scoped to this environment's GitHub
# Environment, the policy scoped to this environment's own Lambda
# function, and the GitHub Environment itself with its vars/secret.
#
# The OIDC provider these all point at is shared across every environment
# — see ../modules/aws_oidc — and comes in via a Terragrunt `dependency`
# block from ../live/<env>/terragrunt.hcl, not managed here.

variable "github_environment_name" {
  description = "GitHub Environment name deploy-backend.yml/migrate-database.yml run under for this environment (e.g. \"Production\", \"Development\") — also what the OIDC role's trust policy subject is scoped to."
  type        = string
}

variable "github_environment_reviewer_user_ids" {
  description = "GitHub numeric user IDs (not usernames) required to approve runs against this GitHub Environment before deploy-backend.yml/migrate-database.yml can proceed. Empty means no approval gate — leave this empty only for environments where that's acceptable (e.g. Development)."
  type        = list(number)
  default     = []
}

locals {
  github_repo_name = split("/", var.github_repository)[1]
}

# Subject matches this environment's GitHub Environment — not a branch
# ref — so this role only trusts runs that went through that environment's
# protection rules, however they're configured.
resource "aws_iam_role" "github_actions" {
  name = "${local.function_name}-github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = var.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:${var.github_environment_name}"
        }
      }
    }]
  })
}

# Scoped to just this environment's own Lambda function — narrower than
# Azure's resource-group-wide "Container Apps Contributor" was, since
# Lambda functions (unlike Container Apps) don't need a read on some
# shared parent resource to be updated.
resource "aws_iam_role_policy" "github_actions_deploy" {
  name = "${local.function_name}-deploy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"]
      Resource = aws_lambda_function.api.arn
    }]
  })
}

resource "github_repository_environment" "this" {
  repository  = local.github_repo_name
  environment = var.github_environment_name

  dynamic "reviewers" {
    for_each = length(var.github_environment_reviewer_user_ids) > 0 ? [1] : []
    content {
      users = var.github_environment_reviewer_user_ids
    }
  }
}

resource "github_actions_environment_variable" "aws_role_arn" {
  repository    = local.github_repo_name
  environment   = github_repository_environment.this.environment
  variable_name = "AWS_ROLE_ARN"
  value         = aws_iam_role.github_actions.arn
}

resource "github_actions_environment_variable" "aws_region" {
  repository    = local.github_repo_name
  environment   = github_repository_environment.this.environment
  variable_name = "AWS_REGION"
  value         = var.aws_region
}

resource "github_actions_environment_variable" "aws_lambda_function_name" {
  repository    = local.github_repo_name
  environment   = github_repository_environment.this.environment
  variable_name = "AWS_LAMBDA_FUNCTION_NAME"
  value         = aws_lambda_function.api.function_name
}

# migrate-database.yml's connection string. Named to match the
# ConnectionStrings:DefaultConnection config key via the double-underscore
# env var convention — the app (and `dotnet ef`, which bootstraps the same
# way) only ever reads that key, never a DATABASE_URL-style var, so the
# secret name has to match exactly or migrations silently connect to
# whatever's in appsettings.json instead.
resource "github_actions_environment_secret" "database_url" {
  repository  = local.github_repo_name
  environment = github_repository_environment.this.environment
  secret_name = "ConnectionStrings__DefaultConnection"
  value       = local.database_connection_string
}
