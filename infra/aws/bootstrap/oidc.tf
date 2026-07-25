# GitHub Actions OIDC -> AWS: lets .github/workflows/deploy-aws.yml assume
# an IAM role without any long-lived AWS access keys stored as secrets.
#
# Lives in bootstrap/ (not the main infra/aws/ stack) deliberately: the
# workflow assumes this role *in order to* run `terraform apply` against
# infra/aws/, so the role can't be defined inside the stack it's used to
# deploy — same bootstrapping reason the state bucket lives here.

data "aws_caller_identity" "current" {}

variable "create_oidc_provider" {
  description = "Whether to create the GitHub Actions OIDC provider. AWS allows only one provider per URL per account — set to false and provide github_oidc_provider_arn if one already exists (e.g. shared with another project)."
  type        = bool
  default     = true
}

variable "github_oidc_provider_arn" {
  description = "ARN of an existing GitHub Actions OIDC provider. Only used when create_oidc_provider = false."
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "GitHub repo allowed to assume the deploy role, as \"owner/name\"."
  type        = string
  default     = "davbrito/come-rico"
}

variable "github_branch" {
  description = "Branch allowed to assume the deploy role. Matches deploy-aws.yml's trigger branch."
  type        = string
  default     = "aws-main"
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  # AWS verifies GitHub's OIDC tokens via its own trust store, not this
  # thumbprint, but the field is still required by the API.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea"]
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : var.github_oidc_provider_arn
}

data "aws_iam_policy_document" "deploy_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:ref:refs/heads/${var.github_branch}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "come-rico-deploy"
  assume_role_policy = data.aws_iam_policy_document.deploy_trust.json
}

# Scoped to what infra/aws/*.tf actually provisions, not a blanket
# PowerUser-style grant. The IAM statement is the one place this can't be
# tightened further than resource-name prefixing, since Terraform manages
# IAM roles (Lambda/Scheduler execution roles) as part of that stack.
data "aws_iam_policy_document" "deploy_permissions" {
  statement {
    sid    = "Lambda"
    effect = "Allow"
    actions = [
      "lambda:CreateFunction",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:GetFunction",
      "lambda:DeleteFunction",
      "lambda:TagResource",
      "lambda:UntagResource",
      "lambda:ListTags",
      "lambda:CreateFunctionUrlConfig",
      "lambda:UpdateFunctionUrlConfig",
      "lambda:GetFunctionUrlConfig",
      "lambda:DeleteFunctionUrlConfig",
      "lambda:AddPermission",
      "lambda:RemovePermission",
      "lambda:GetPolicy",
    ]
    resources = ["arn:aws:lambda:*:${data.aws_caller_identity.current.account_id}:function:come-rico-*"]
  }

  statement {
    sid    = "S3"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:GetBucketVersioning",
      "s3:PutBucketVersioning",
      "s3:PutBucketPublicAccessBlock",
      "s3:GetBucketPublicAccessBlock",
      "s3:PutBucketPolicy",
      "s3:GetBucketPolicy",
      "s3:GetEncryptionConfiguration",
    ]
    resources = [
      "arn:aws:s3:::come-rico-*",
      "arn:aws:s3:::come-rico-*/*",
    ]
  }

  statement {
    sid       = "CloudFront"
    effect    = "Allow"
    actions   = ["cloudfront:*"] # distribution/OAC IDs are only known after creation, so this can't be name-scoped like the rest
    resources = ["*"]
  }

  statement {
    sid    = "IAMManageAppRoles"
    effect = "Allow"
    actions = [
      "iam:CreateRole",
      "iam:GetRole",
      "iam:DeleteRole",
      "iam:PutRolePolicy",
      "iam:GetRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:TagRole",
      "iam:UntagRole",
    ]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/come-rico-*"]
  }

  statement {
    sid       = "IAMPassAppRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/come-rico-*"]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com", "scheduler.amazonaws.com"]
    }
  }

  statement {
    sid    = "EventBridgeScheduler"
    effect = "Allow"
    actions = [
      "scheduler:CreateSchedule",
      "scheduler:GetSchedule",
      "scheduler:UpdateSchedule",
      "scheduler:DeleteSchedule",
      "scheduler:TagResource",
    ]
    resources = ["arn:aws:scheduler:*:${data.aws_caller_identity.current.account_id}:schedule/*/come-rico-*"]
  }

  statement {
    sid    = "EventBridgeApiDestinations"
    effect = "Allow"
    actions = [
      "events:CreateConnection",
      "events:UpdateConnection",
      "events:DeleteConnection",
      "events:DescribeConnection",
      "events:CreateApiDestination",
      "events:UpdateApiDestination",
      "events:DeleteApiDestination",
      "events:DescribeApiDestination",
    ]
    resources = [
      "arn:aws:events:*:${data.aws_caller_identity.current.account_id}:connection/come-rico-*",
      "arn:aws:events:*:${data.aws_caller_identity.current.account_id}:api-destination/come-rico-*",
    ]
  }

  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy",
      "logs:TagResource",
      "logs:DescribeLogGroups",
    ]
    resources = ["arn:aws:logs:*:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/come-rico-*"]
  }

  statement {
    sid       = "STS"
    effect    = "Allow"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploy_permissions" {
  name   = "come-rico-deploy-permissions"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy_permissions.json
}

output "deploy_role_arn" {
  description = "Paste into the AWS_DEPLOY_ROLE_ARN GitHub secret."
  value       = aws_iam_role.deploy.arn
}
