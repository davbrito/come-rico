data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# ECR — holds the Lambda Web Adapter container image built from
# backend/Dockerfile.lambda
# ---------------------------------------------------------------------------

resource "aws_ecr_repository" "backend" {
  name                 = var.project_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep only the 10 most recent images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# ---------------------------------------------------------------------------
# Lambda function (container image) + Function URL
# ---------------------------------------------------------------------------

resource "aws_iam_role" "lambda_exec" {
  name = "${var.project_name}-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/aws/lambda/${var.project_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "backend" {
  function_name = var.project_name
  role          = aws_iam_role.lambda_exec.arn

  package_type = "Image"
  image_uri    = "${aws_ecr_repository.backend.repository_url}:${var.image_tag}"

  memory_size = var.memory_size
  timeout     = var.timeout

  environment {
    variables = {
      ASPNETCORE_ENVIRONMENT                    = "Production"
      ConnectionStrings__DefaultConnection      = var.connection_string
      R2__ServiceUrl                            = var.r2_service_url
      R2__AccessKeyId                           = var.r2_access_key_id
      R2__SecretAccessKey                       = var.r2_secret_access_key
      R2__BucketName                            = var.r2_bucket_name
      R2__PublicBaseUrl                         = var.r2_public_base_url
      CRON_SECRET                                = var.cron_secret
      # Web adapter listens for requests and forwards them to the app on this port.
      PORT                 = "8080"
      AWS_LWA_INVOKE_MODE  = "buffered"
    }
  }

  depends_on = [aws_iam_role_policy_attachment.lambda_basic_execution, aws_cloudwatch_log_group.backend]
}

resource "aws_lambda_function_url" "backend" {
  function_name      = aws_lambda_function.backend.function_name
  authorization_type = "NONE" # app handles its own cookie/bearer auth
  invoke_mode        = "BUFFERED"
}

# ---------------------------------------------------------------------------
# Weekly orphaned-file cleanup cron (replaces Vercel Cron)
# EventBridge Scheduler -> API destination -> GET /api/images/cleanup with
# the same Authorization: Bearer {CRON_SECRET} header the endpoint already
# expects, so no application code changes are needed.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_event_connection" "cleanup_cron" {
  name               = "${var.project_name}-cleanup-cron"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key   = "Authorization"
      value = "Bearer ${var.cron_secret}"
    }
  }
}

resource "aws_cloudwatch_event_api_destination" "cleanup_cron" {
  name                             = "${var.project_name}-cleanup-cron"
  invocation_endpoint              = "${aws_lambda_function_url.backend.function_url}api/images/cleanup"
  http_method                      = "GET"
  invocation_rate_limit_per_second = 1
  connection_arn                   = aws_cloudwatch_event_connection.cleanup_cron.arn
}

resource "aws_iam_role" "scheduler_invoke_cleanup_cron" {
  name = "${var.project_name}-cleanup-cron-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_invoke_cleanup_cron" {
  name = "invoke-api-destination"
  role = aws_iam_role.scheduler_invoke_cleanup_cron.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "events:InvokeApiDestination"
      Resource = aws_cloudwatch_event_api_destination.cleanup_cron.arn
    }]
  })
}

resource "aws_scheduler_schedule" "cleanup_cron" {
  name                         = "${var.project_name}-cleanup-cron"
  schedule_expression          = var.cleanup_cron_schedule
  schedule_expression_timezone = "UTC"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_cloudwatch_event_api_destination.cleanup_cron.arn
    role_arn = aws_iam_role.scheduler_invoke_cleanup_cron.arn
  }
}
