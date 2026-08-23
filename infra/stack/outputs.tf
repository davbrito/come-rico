output "app_hostname" {
  description = "The Lambda Function URL, e.g. https://<url-id>.lambda-url.<region>.on.aws/."
  value       = aws_lambda_function_url.api.function_url
}

output "app_name" {
  value = aws_lambda_function.api.function_name
}

output "neon_project_id" {
  value = neon_project.this.id
}

output "r2_bucket_name" {
  value = cloudflare_r2_bucket.images.name
}

output "r2_public_base_url" {
  value = local.r2_public_base_url
}
