output "artifacts_bucket" {
  description = "S3 bucket holding the Lambda deployment zip."
  value       = aws_s3_bucket.artifacts.id
}

output "function_url" {
  description = "Lambda Function URL. Point the Vercel rewrite for /api/(.*) at this host."
  value       = aws_lambda_function_url.backend.function_url
}

output "lambda_function_name" {
  value = aws_lambda_function.backend.function_name
}

output "aws_region" {
  value = var.aws_region
}
