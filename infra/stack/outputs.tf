output "app_hostname" {
  description = "The Container App's ingress FQDN, e.g. ca-come-rico-prod.<env-id>.<region>.azurecontainerapps.io. Unlike App Service's fully predictable *.azurewebsites.net name, this includes an environment-generated label only known after the first apply."
  value       = azurerm_container_app.api.ingress[0].fqdn
}

output "app_name" {
  value = azurerm_container_app.api.name
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
