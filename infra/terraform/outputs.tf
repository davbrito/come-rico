output "app_hostname" {
  description = "The App Service's default hostname, e.g. app-come-rico-prod-ab12.azurewebsites.net"
  value       = azurerm_linux_web_app.api.default_hostname
}

output "app_name" {
  value = azurerm_linux_web_app.api.name
}

output "resource_group_name" {
  value = azurerm_resource_group.this.name
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
