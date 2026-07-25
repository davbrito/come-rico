# ---------------------------------------------------------------------------
# Weekly orphaned-file cleanup cron (replaces Vercel Cron)
# EventBridge Scheduler -> API destination -> GET /api/images/cleanup with
# the same Authorization: Bearer {CRON_SECRET} header the endpoint already
# expects, so no application code changes are needed.
#
# Calls through the CloudFront domain (not the backend Function URL
# directly) — the Function URL requires AWS_IAM/SigV4 now (see backend.tf +
# cloudfront.tf's Origin Access Control), which a plain bearer-header API
# destination can't produce. Going through CloudFront is exactly what a
# browser request would do, so this just reuses that path.
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
  invocation_endpoint              = "https://${aws_cloudfront_distribution.main.domain_name}/api/images/cleanup"
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
