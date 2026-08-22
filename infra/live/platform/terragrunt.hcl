# A single CI identity, shared by every environment's GitHub Actions
# deploys — not tied to prod or dev specifically, so it's its own unit
# rather than living inside either one's state. See
# ../../modules/github_actions_ci/main.tf.

include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "../../modules/github_actions_ci"
}
