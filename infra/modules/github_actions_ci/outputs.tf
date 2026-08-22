output "client_id" {
  value = azuread_application.github_actions.client_id
}

# The application's Terraform/object ID — what
# azuread_application_federated_identity_credential.application_id needs
# in each env stack, distinct from client_id above.
output "application_id" {
  value = azuread_application.github_actions.id
}

# Service principal object ID — what each env stack's
# azurerm_role_assignment.principal_id needs.
output "principal_id" {
  value = azuread_service_principal.github_actions.object_id
}
