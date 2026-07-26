output "backend_url" {
  description = "Azure App Service URL. Passed to the Worker as the BACKEND_URL var at deploy time; the Worker proxies /api/** here, so browsers never hit it directly."
  value       = local.backend_url
}

output "backend_resource_group" {
  description = "Used by the `az webapp deploy` step in CI."
  value       = azurerm_resource_group.main.name
}

output "backend_app_name" {
  value = azurerm_linux_web_app.api.name
}

output "images_bucket" {
  value = cloudflare_r2_bucket.images.name
}
