locals {
  name_suffix = var.app_name_unique_suffix ? "-${random_string.suffix.result}" : ""

  # Lambda function names allow letters/digits/-/_ and are unique per
  # account+region on their own — no Azure-CAF-style resource-group
  # scoping needed, so this stays a flat "<workload>-<environment>[-<suffix>]".
  function_name  = "${var.workload}-${var.environment}${local.name_suffix}"
  r2_bucket_name = "r2-${var.workload}-${var.environment}"

  # Applied to every taggable aws_* resource in this stack. AWS has no
  # Azure-style mandatory containment (every resource had to live inside
  # exactly one azurerm_resource_group) — resources are flat at the
  # account/region level, so this tag set plus resource_group.tf's
  # aws_resourcegroups_group (a saved tag-based filter, not a real
  # container) is what gives an equivalent "everything for this
  # environment" view in the console.
  aws_tags = {
    project     = var.workload
    environment = var.environment
    managed_by  = "terraform"
  }
}

# Only used when app_name_unique_suffix is true — kept for parity with the
# old Azure naming, in case a name collision within the AWS account/region
# ever needs extra insurance.
resource "random_string" "suffix" {
  length  = 4
  special = false
  upper   = false
}
