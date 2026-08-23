# A single GitHub Actions OIDC provider, shared across every environment's
# CI deploys — AWS accounts allow only one IAM OIDC provider per issuer
# URL, so this can't be created per-environment inside ../../stack the way
# the old azuread_application_federated_identity_credential was (that was
# per-environment; the *identity* itself was the shared piece there too,
# see the old modules/github_actions_ci). Deliberately its own Terragrunt
# unit (../../live/platform/aws-oidc), same reasoning as that module had.
#
# Everything environment-specific — the IAM role, its trust policy scoped
# to that environment's GitHub Environment, and the policy scoped to that
# environment's own Lambda function — lives in ../../stack/ci.tf instead,
# which reads this provider's ARN via a Terragrunt `dependency` block from
# ../../live/dev and ../../live/prod.

data "tls_certificate" "github_actions" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions.certificates[0].sha1_fingerprint]
}
