# Backend hosting — AWS Lambda

The frontend stays on Vercel. Only the .NET backend runs on AWS, as a
single Lambda function behind a Function URL (no API Gateway, no
container/ECR — a zip package on the managed `dotnet10` runtime).

```
browser ──► Vercel (frontend SSR + /api/* rewrite) ──► Lambda Function URL (.NET API)
                                                              │
                                              Neon (Postgres) ─┴─ Cloudflare R2 (images)
```

The browser calls the Lambda Function URL directly, cross-origin — the
API's CORS policy (`Program.cs`) allows the frontend's origin(s)
explicitly with credentials, and the auth cookie uses `SameSite=None` in
production (required for a cross-site cookie) instead of the same-origin
`Lax` a Container Apps-style rewrite would have allowed.

Infrastructure is managed with Terraform — see [`infra/stack/`](stack/README.md).
It provisions the Lambda function/role/log group (via
`infra/stack/lambda.tf`), the Neon Postgres project/branch, and the
Cloudflare R2 bucket, templated by `environment` so a second environment
is just a new `infra/live/<env>/terragrunt.hcl` (see
[`infra/README.md`](README.md)). Use `terragrunt apply` instead of the
`aws` CLI/console steps this replaces.

## Cost

Everything stays on free tiers, permanently — not a 12-month trial like
several AWS services: Lambda's always-free monthly allowance (1,000,000
requests, 400,000 GB-seconds of compute — account-wide, shared across
every function), Function URLs (no charge beyond the Lambda invocation
itself), CloudWatch Logs (5 GB/month ingestion free, capped further by
each function's own log retention), Neon free, Cloudflare R2 free, Vercel
Hobby.

Lambda scales to zero by default — an idle function costs nothing beyond
the free allowance either way. Cold starts after idle aren't mitigated
here (managed runtime, no Native AOT) — for a low-traffic household app
this is an acceptable tradeoff for staying off any paid tier.

Upgrading compute (`memory_size`/`timeout` on `aws_lambda_function.api` in
`infra/stack/lambda.tf`) is a one-line change if you outgrow the free
allowance — deliberate, not automatic.

## One-time setup

See [`infra/README.md`](README.md) — provisioning goes through Terragrunt
(`cd infra/live/prod && terragrunt apply`), not `terraform` directly.

This creates, all named `come-rico-prod` (see
[naming](stack/README.md#naming)):

- An IAM execution role, a CloudWatch log group, and the Lambda function
  itself, with a public Function URL
- A Neon project + branch + database + role for `prod`
- A Cloudflare R2 bucket for images

...and wires the Neon connection string + R2 bucket name straight into the
function's environment variables in one pass. See
[`infra/stack/README.md`](stack/README.md) for details and what's
intentionally left out of Terraform (the actual code deploy, CI secrets,
migrations).

### Environment variables

Set via `aws_lambda_function.api`'s `environment` block in
`infra/stack/lambda.tf`, sourced from Terraform resources/variables —
nothing to run by hand:

```
ConnectionStrings__DefaultConnection  = local.database_connection_string   # built from the Neon resources
R2__ServiceUrl                        = local.r2_service_url               # <account_id>.r2.cloudflarestorage.com
R2__AccessKeyId                       = local.r2_access_key_id             # generated Cloudflare API token, see stack/r2.tf
R2__SecretAccessKey                   = local.r2_secret_access_key
R2__BucketName                        = cloudflare_r2_bucket.images.name
R2__PublicBaseUrl                     = local.r2_public_base_url           # https://storage-<environment>.<base_domain>
CRON_SECRET                           = random_password.cron_secret.result
Cors__AllowedOrigins__0               = "https://${base_domain}"           # prod only
Cors__AllowedOriginSuffixes__0        = ".vercel.app"                      # dev only — no fixed preview origin to allowlist
```

Lambda encrypts every environment variable at rest with an AWS-managed
KMS key by default — unlike Container Apps, there's no separate
plain-value/secret-reference split to think about.

> The Neon connection string is assembled in ADO.NET `keyword=value`
> format, not a `postgres://` URI — the app reads
> `ConnectionStrings:DefaultConnection` directly and does no URI parsing.

No registry pull credential is needed — zip deploys don't pull from
anywhere at runtime, unlike Container Apps' `ghcr-pat` secret.

## Wiring it to Vercel

Two env vars on the Vercel project carry the backend URL to the two
places the frontend calls it from (see `frontend/src/lib/api.ts`), both
Terraform-managed (`infra/modules/vercel/vercel.tf`, kept in sync with
`app_hostname` on every apply):

1. **`BACKEND_URL`** — the SSR path, read server-side
   (`process.env.BACKEND_URL`); TanStack Start's server calls the backend
   directly during `beforeLoad`.
2. **`VITE_BACKEND_URL`** — the browser path, inlined into the client
   bundle at build time (`import.meta.env.VITE_BACKEND_URL`) since
   `process.env` isn't available client-side. The browser calls this
   cross-origin (no rewrite in front of it), so it also needs the API's
   CORS policy to allow the calling origin — see
   [Environment variables](#environment-variables)'s `Cors__*` entries.

Both must be set, or auth will work on first paint (SSR) but not in the
browser (or vice versa).

## CI/CD

`.github/workflows/deploy-backend.yml` deploys on pushes to `main` that
touch `backend/**`, plus manual dispatch. It publishes the API
(`dotnet publish -r linux-arm64 --self-contained false`), zips the
output, and pushes it with `aws lambda update-function-code` — AWS auth is
OIDC (no stored credential), using an IAM role Terraform creates in
`infra/stack/ci.tf`, trusting a GitHub Actions OIDC provider Terraform
creates once in `infra/modules/aws_oidc`. Configure once, after
`terragrunt apply`: see
[`infra/stack/README.md#cicd`](stack/README.md#cicd) for the exact
outputs to wire into the `Production` GitHub Environment's variables.

Database migrations are unchanged — still `migrate-database.yml`
(`dotnet ef database update`) run manually against Neon.

## Notes

- Function URLs terminate TLS and are always HTTPS. The auth cookie uses
  `CookieSecurePolicy.Always` in production, so this works with no extra
  middleware.
- All secrets (Neon/R2 credentials, `CRON_SECRET`) live in the function's
  environment variables — see [Environment variables](#environment-variables)
  above.
