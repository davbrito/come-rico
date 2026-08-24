# The .NET API as a single Lambda function behind a Function URL — no API
# Gateway (Function URLs are free; API Gateway HTTP APIs bill past their
# first-12-months allowance) and no per-subscription environment cap to
# work around like Azure Container Apps Environments had, so this is
# fully per-environment (unlike ../modules/aws_oidc, which has to stay a
# single shared "platform" unit — see ci.tf).
#
# Packaging is a zip on the managed `dotnet10` runtime — no container
# image, no ECR. See .github/workflows/deploy-backend.yml for the build.

resource "aws_iam_role" "lambda_exec" {
  name = "${local.function_name}-exec"
  tags = local.aws_tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  # Must match what Lambda auto-creates for this function
  # (/aws/lambda/<function_name>) — declared here instead of left to
  # auto-creation so retention is set from day one, not after the first
  # invocation already wrote at the (infinite) default. Kept short so a
  # noisy logging bug can't approach the 5GB/month free ingestion
  # allowance.
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = 7
  tags              = local.aws_tags
}

# Scoped to just this function's own log group — narrower than the
# AWSLambdaBasicExecutionRole managed policy, which grants CreateLogGroup
# account-wide.
resource "aws_iam_role_policy" "lambda_logs" {
  name = "${local.function_name}-logs"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.api.arn}:*"
    }]
  })
}

# Placeholder deployment package — unlike Container Apps' GHCR image
# (which had to already exist externally, a real chicken-and-egg problem),
# Terraform can just generate a trivial valid zip itself, so there's no
# public-placeholder-image workaround needed here. deploy-backend.yml
# replaces this with the real build via `aws lambda update-function-code`;
# lifecycle.ignore_changes below stops Terraform from reverting that on
# the next apply.
resource "local_file" "lambda_placeholder" {
  filename = "${path.module}/.lambda-placeholder/bootstrap"
  content  = "placeholder — replaced by deploy-backend.yml's aws lambda update-function-code"
}

data "archive_file" "lambda_placeholder" {
  type        = "zip"
  source_file = local_file.lambda_placeholder.filename
  output_path = "${path.module}/.lambda-placeholder/placeholder.zip"
}

resource "aws_lambda_function" "api" {
  function_name = local.function_name
  role          = aws_iam_role.lambda_exec.arn
  tags          = local.aws_tags

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  # Managed .NET 10 runtime (GA Jan 2026) — see AddAWSLambdaHosting in
  # backend/ComeRico.Api/Program.cs. arm64/Graviton2: cheaper, and counts
  # the same against the Lambda free tier's GB-seconds allowance as x86.
  runtime       = "dotnet10"
  architectures = ["arm64"]

  # Amazon.Lambda.AspNetCoreServer.Hosting's self-hosting bootstrap reads
  # the handler as the published assembly name, not a
  # Type::Method-qualified string — confirm this against
  # docs.aws.amazon.com/lambda/latest/dg/csharp-handler.html on first real
  # deploy; the placeholder package above never actually invokes it.
  handler = "ComeRico.Api"

  memory_size = 512
  timeout     = 29 # Function URLs hard-cap responses at 30s regardless of this value

  # Lambda encrypts every env var at rest with an AWS-managed KMS key by
  # default — unlike Container Apps, there's no separate secret{}
  # indirection needed to keep these out of a plain env list.
  environment {
    variables = merge(
      {
        ASPNETCORE_ENVIRONMENT                 = var.environment == "prod" ? "Production" : "Staging"
        "ConnectionStrings__DefaultConnection" = local.database_connection_string
        "R2__ServiceUrl"                       = local.r2_service_url
        "R2__AccessKeyId"                      = local.r2_access_key_id
        "R2__SecretAccessKey"                  = local.r2_secret_access_key
        "R2__BucketName"                       = cloudflare_r2_bucket.images.name
        "R2__PublicBaseUrl"                    = local.r2_public_base_url
        "CRON_SECRET"                          = random_password.cron_secret.result
      },
      # ASP.NET Core binds array config from indexed double-underscore
      # keys (Cors__AllowedOrigins__0, __1, ...) — see local.cors_* below.
      { for i, origin in local.cors_allowed_origins : "Cors__AllowedOrigins__${i}" => origin },
      { for i, suffix in local.cors_allowed_origin_suffixes : "Cors__AllowedOriginSuffixes__${i}" => suffix },
    )
  }

  depends_on = [aws_cloudwatch_log_group.api, aws_iam_role_policy.lambda_logs]

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# authorization_type = NONE — this is a public API, called directly by
# the browser cross-origin now (see the Cors__* env vars above); Function
# URLs have no IP allowlist, so CORS on the app itself is what actually
# restricts who can read a response, not anything here.
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"
}

locals {
  # Production has one fixed public domain; dev's Vercel target is the
  # default *.vercel.app preview alias (a different subdomain per
  # deployment), so there's no fixed origin to allowlist there — a suffix
  # match is the only option. See stack/README.md#vercel-frontend for why
  # dev doesn't get its own base_domain-scoped hostname the way prod does.
  cors_allowed_origins         = var.environment == "prod" ? ["https://${var.base_domain}"] : []
  cors_allowed_origin_suffixes = var.environment == "prod" ? [] : [".vercel.app"]
}
