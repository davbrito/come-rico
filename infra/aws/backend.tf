data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# Deployment package storage — Lambda zip packages for a self-contained .NET
# app comfortably exceed the 50MB direct-upload limit, so upload via S3.
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "artifacts" {
  bucket_prefix = "${var.project_name}-artifacts-"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_object" "backend_zip" {
  bucket = aws_s3_bucket.artifacts.id
  key    = "backend/function.zip"
  source = var.backend_zip_path
  etag   = filemd5(var.backend_zip_path)
}

# ---------------------------------------------------------------------------
# Backend Lambda function (zip package, custom runtime via
# Amazon.Lambda.AspNetCoreServer.Hosting) + Function URL
# ---------------------------------------------------------------------------

resource "aws_iam_role" "backend_exec" {
  name = "${var.project_name}-backend-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "backend_basic_execution" {
  role       = aws_iam_role.backend_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/aws/lambda/${var.project_name}-backend"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "backend" {
  function_name = "${var.project_name}-backend"
  role          = aws_iam_role.backend_exec.arn

  package_type = "Zip"
  s3_bucket    = aws_s3_bucket.artifacts.id
  s3_key       = aws_s3_object.backend_zip.key
  # Forces a re-deploy whenever the local zip changes, even though the S3 key stays the same.
  source_code_hash = filebase64sha256(var.backend_zip_path)

  # Amazon.Lambda.AspNetCoreServer.Hosting runs its own Lambda Runtime API
  # loop (via Amazon.Lambda.RuntimeSupport) instead of Kestrel, so this needs
  # a custom runtime rather than one of AWS's managed dotnetN runtimes (net10
  # doesn't have one yet, and this approach isn't tied to that anyway). The
  # "handler" value is required by the API but ignored by the runtime shim.
  runtime       = "provided.al2023"
  architectures = [var.lambda_architecture]
  handler       = "ComeRico.Api"

  memory_size = var.memory_size
  timeout     = var.timeout

  environment {
    variables = {
      ASPNETCORE_ENVIRONMENT               = "Production"
      ConnectionStrings__DefaultConnection = var.connection_string
      R2__ServiceUrl                       = var.r2_service_url
      R2__AccessKeyId                      = var.r2_access_key_id
      R2__SecretAccessKey                  = var.r2_secret_access_key
      R2__BucketName                       = var.r2_bucket_name
      R2__PublicBaseUrl                    = var.r2_public_base_url
      CRON_SECRET                          = var.cron_secret
    }
  }

  depends_on = [aws_iam_role_policy_attachment.backend_basic_execution, aws_cloudwatch_log_group.backend]
}

# AWS_IAM (not NONE): only CloudFront, via the Origin Access Control in
# cloudfront.tf, is allowed to invoke this. The raw *.lambda-url.*.on.aws
# address rejects unsigned requests.
resource "aws_lambda_function_url" "backend" {
  function_name      = aws_lambda_function.backend.function_name
  authorization_type = "AWS_IAM"
  invoke_mode        = "BUFFERED"
}
