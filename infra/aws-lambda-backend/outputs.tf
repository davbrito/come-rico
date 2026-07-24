output "ecr_repository_url" {
  description = "Push the backend image here (see backend/Dockerfile.lambda), then apply again if image_tag changed."
  value       = aws_ecr_repository.backend.repository_url
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
