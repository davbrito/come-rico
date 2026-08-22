# Azure Cloud Adoption Framework naming convention:
# <resource-type-abbreviation>-<workload>-<environment>[-<region>][-<suffix>]
# https://learn.microsoft.com/azure/cloud-adoption-framework/ready/azure-best-practices/resource-abbreviations

locals {
  region_abbreviations = {
    eastus      = "eus"
    eastus2     = "eus2"
    westus      = "wus"
    westus2     = "wus2"
    westus3     = "wus3"
    centralus   = "cus"
    northeurope = "neu"
    westeurope  = "weu"
  }

  region_abbreviation = lookup(local.region_abbreviations, var.azure_location, var.azure_location)
  name_suffix         = var.app_name_unique_suffix ? "-${random_string.suffix.result}" : ""

  resource_group_name = "rg-${var.workload}-${var.environment}-${local.region_abbreviation}"
  service_plan_name   = "plan-${var.workload}-${var.environment}-${local.region_abbreviation}"
  app_name            = "app-${var.workload}-${var.environment}${local.name_suffix}"

  r2_bucket_name = "r2-${var.workload}-${var.environment}"
}

# Only used when app_name_unique_suffix is true — App Service names are a
# global DNS namespace (<name>.azurewebsites.net), so the plain
# app-<workload>-<environment> name can collide with another subscription.
resource "random_string" "suffix" {
  length  = 4
  special = false
  upper   = false
}
