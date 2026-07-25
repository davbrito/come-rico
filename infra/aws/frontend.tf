# ---------------------------------------------------------------------------
# Frontend SSR Lambda function (TanStack Start / Nitro "aws-lambda" preset,
# zip package, standard nodejs managed runtime — no custom runtime needed)
# + Function URL
# ---------------------------------------------------------------------------

resource "aws_s3_object" "frontend_zip" {
  bucket = aws_s3_bucket.artifacts.id
  key    = "frontend/function.zip"
  source = var.frontend_zip_path
  etag   = filemd5(var.frontend_zip_path)
}

resource "aws_iam_role" "frontend_exec" {
  name = "${var.project_name}-frontend-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "frontend_basic_execution" {
  role       = aws_iam_role.frontend_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/aws/lambda/${var.project_name}-frontend"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "frontend" {
  function_name = "${var.project_name}-frontend"
  role          = aws_iam_role.frontend_exec.arn

  package_type = "Zip"
  s3_bucket    = aws_s3_bucket.artifacts.id
  s3_key       = aws_s3_object.frontend_zip.key
  source_code_hash = filebase64sha256(var.frontend_zip_path)

  runtime       = var.frontend_node_runtime
  architectures = [var.lambda_architecture]
  handler       = "index.handler"

  memory_size = var.frontend_memory_size
  timeout     = var.timeout

  # No runtime env vars needed — production routing (what used to be
  # BACKEND_URL for the dev proxy) is CloudFront's job now, not the app's.

  depends_on = [aws_iam_role_policy_attachment.frontend_basic_execution, aws_cloudwatch_log_group.frontend]
}

# AWS_IAM (not NONE): only CloudFront, via Origin Access Control, may invoke
# this — see cloudfront.tf.
resource "aws_lambda_function_url" "frontend" {
  function_name      = aws_lambda_function.frontend.function_name
  authorization_type = "AWS_IAM"
  invoke_mode        = "BUFFERED"
}

# ---------------------------------------------------------------------------
# Static assets (`.output/public/` after `pnpm build`) — served directly by
# CloudFront from S3, never through the Lambda, so hashed JS/CSS/images
# don't burn Lambda invocations or add latency.
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "static_assets" {
  bucket_prefix = "${var.project_name}-static-"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "static_assets" {
  bucket                  = aws_s3_bucket.static_assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Actual asset upload (`aws s3 sync .output/public/ s3://<bucket>/`) happens
# in the deploy workflow, not here — Terraform only owns the bucket and its
# CloudFront access policy (see cloudfront.tf).
