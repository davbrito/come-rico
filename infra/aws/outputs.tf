output "artifacts_bucket" {
  description = "S3 bucket holding both Lambda deployment zips."
  value       = aws_s3_bucket.artifacts.id
}

output "static_assets_bucket" {
  description = "S3 bucket for frontend static assets — sync `.output/public/` here on every deploy."
  value       = aws_s3_bucket.static_assets.id
}

output "cloudfront_domain_name" {
  description = "The app's public URL (no custom domain configured). This is the single entry point for everything — frontend, API, static assets."
  value       = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.main.id
}

output "backend_function_name" {
  value = aws_lambda_function.backend.function_name
}

output "frontend_function_name" {
  value = aws_lambda_function.frontend.function_name
}

output "aws_region" {
  value = var.aws_region
}
