# AWS has no Azure-style resource group (a mandatory container every
# resource must live inside) — resources are flat at the account/region
# level. The closest equivalent is an AWS Resource Group: a saved,
# tag-based *filter*, not a real container — deleting this doesn't delete
# anything it matches, and a resource not tagged with local.aws_tags
# simply won't show up in it. Gives the same "see everything for this
# environment in one place" console view the old azurerm_resource_group
# gave, without changing how any resource here is actually managed.
resource "aws_resourcegroups_group" "this" {
  name = local.function_name
  tags = local.aws_tags

  resource_query {
    query = jsonencode({
      ResourceTypeFilters = ["AWS::AllSupported"]
      TagFilters = [
        { Key = "project", Values = [local.aws_tags.project] },
        { Key = "environment", Values = [local.aws_tags.environment] },
      ]
    })
  }
}
