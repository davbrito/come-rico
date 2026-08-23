# Arbitrary shared secret (not tied to any third-party account), so
# Terraform can just generate it — no external token to fetch.
resource "random_password" "cron_secret" {
  length  = 32
  special = false
}
