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

  resource_group_name    = "rg-${var.workload}-${var.environment}-${local.region_abbreviation}"
  container_app_env_name = "cae-${var.workload}-${var.environment}-${local.region_abbreviation}"
  container_app_name     = "ca-${var.workload}-${var.environment}${local.name_suffix}"

  r2_bucket_name = "r2-${var.workload}-${var.environment}"
}

# Only used when app_name_unique_suffix is true — Container Apps ingress
# FQDNs are already unique per environment (they carry the environment's
# own generated label), but the *name* itself is still scoped per resource
# group, so a suffix is only needed if you want extra insurance against a
# name collision within the group.
resource "random_string" "suffix" {
  length  = 4
  special = false
  upper   = false
}
