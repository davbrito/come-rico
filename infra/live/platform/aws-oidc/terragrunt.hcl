# A single GitHub Actions OIDC provider, shared by every environment's IAM
# role — AWS accounts only allow one OIDC provider per issuer URL, so it
# can't live inside live/dev or live/prod's own state. See
# ../../../modules/aws_oidc/main.tf.

include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "../../../modules/aws_oidc"
}
