# ComeRico on AWS (always-free tier)

Replaces Vercel entirely: backend (.NET) and frontend (TanStack Start) each
run as an AWS Lambda function, with a single CloudFront distribution in
front of both plus an S3 bucket for static assets — CloudFront does the
path-based routing `vercel.json`'s `rewrites` used to do, so the browser
only ever talks to one origin (no CORS changes, cookies keep working as-is).

| Vercel piece | AWS replacement |
|---|---|
| `backend` service (Docker) | `aws_lambda_function.backend` — zip, custom runtime (`provided.al2023`), `Amazon.Lambda.AspNetCoreServer.Hosting` |
| `frontend` service (Nitro/TanStack Start) | `aws_lambda_function.frontend` — zip, `nodejs22.x`, Nitro's `aws-lambda` preset |
| static assets bundled into the frontend service | `aws_s3_bucket.static_assets`, served by CloudFront directly (never through the Lambda) |
| `vercel.json` `rewrites` | `aws_cloudfront_distribution.main` (behaviors: `/api/*` → backend, `/assets/*` → S3, `/*` → frontend) |
| `vercel.json` `crons` | `aws_scheduler_schedule.cleanup_cron` (EventBridge Scheduler → API destination → CloudFront domain) |
| Vercel's automatic HTTPS/edge | CloudFront's default `*.cloudfront.net` domain (no custom domain configured — see "Custom domain" below if you want one) |

Both Lambda Function URLs use `authorization_type = "AWS_IAM"` and are only
invocable by CloudFront (via Origin Access Control) — hitting them directly
at their raw `*.lambda-url.*.on.aws` address is rejected. CloudFront is the
only supported entry point.

Neon (Postgres) and Cloudflare R2 are unaffected by any of this — only
compute/hosting moves. Migrations are unaffected too — they still run via
`.github/workflows/migrate-database.yml` (`dotnet ef database update`)
directly against Neon, independent of where the app runtime lives.

## One-time setup

### 1. State bucket + GitHub OIDC role (bootstrap)

`infra/aws/bootstrap/` is applied once, manually, with your own AWS
credentials — it creates the things CI needs to exist *before* it can run
Terraform against the main stack (the state bucket, and the IAM role CI
assumes), so it can't live in `infra/aws/` itself (chicken-and-egg) and
stays on local state (nothing to point a remote backend at yet):

```bash
cd infra/aws/bootstrap
terraform init
terraform apply
terraform output state_bucket     # -> TF_STATE_BUCKET secret
terraform output deploy_role_arn  # -> AWS_DEPLOY_ROLE_ARN secret
```

This also creates the GitHub Actions OIDC provider
(`token.actions.githubusercontent.com`) — AWS allows only one per account,
so if your account already has one (e.g. shared with another project), set
`create_oidc_provider = false` and pass its ARN via
`github_oidc_provider_arn` instead. The deploy role's trust policy is
scoped to `davbrito/come-rico` on the `aws-main` branch specifically
(`github_repo`/`github_branch` variables); its permissions are scoped by
resource-name prefix (`come-rico-*`) to what `infra/aws/*.tf` actually
provisions — see `infra/aws/bootstrap/oidc.tf` for the exact statements.

### 2. Repository secrets/variables

| Name | Used by |
|---|---|
| `TF_STATE_BUCKET` | workflow — `state_bucket` output from step 1 |
| `AWS_DEPLOY_ROLE_ARN` | workflow — `deploy_role_arn` output from step 1 |
| `NEON_CONNECTION_STRING` | Terraform `connection_string` var |
| `R2_SERVICE_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL` | Terraform R2 vars |
| `CRON_SECRET` | Terraform `cron_secret` var — also required by `GET /api/images/cleanup` |

Set these under the `Production` GitHub Environment (referenced by
`.github/workflows/deploy-aws.yml`), matching the existing
`migrate-database.yml` convention.

## CI/CD

`.github/workflows/deploy-aws.yml` runs on every push to **`aws-main`**
(not `main` — kept separate for now so the Vercel-served production branch
isn't touched while this is being validated) plus manual dispatch:

1. Publishes the backend self-contained, zips it with a `bootstrap`
   entrypoint (custom `provided.al2023` runtime — net10.0 has no
   AWS-managed Lambda runtime yet).
2. Builds the frontend (`pnpm build`, using the `aws-lambda` Nitro preset
   set in `frontend/vite.config.ts`), installs production `node_modules`
   into `.output/server/` (needed for `sharp`'s native binary, used by
   `@vercel/og` — pinned to Node 22 to match the `nodejs22.x` Lambda
   runtime; a Node-version mismatch here would ship an incompatible
   binary), zips it.
3. `terraform init` (S3 backend) + `terraform apply -auto-approve`,
   authenticated via OIDC.
4. `aws s3 sync` the built `.output/public/` to the static-assets bucket.

## Manual build & deploy (if not using CI)

```bash
# Backend
cd backend
dotnet publish ComeRico.Api/ComeRico.Api.csproj -c Release -r linux-x64 \
  --self-contained true -p:PublishReadyToRun=false -o publish
mv publish/ComeRico.Api publish/bootstrap && chmod +x publish/bootstrap
(cd publish && zip -r ../function.zip . -x '*.pdb')

# Frontend — use Node 22 here, matching frontend_node_runtime
cd ../frontend
pnpm install && pnpm build
(cd .output/server && npm install --omit=dev && zip -r ../server.zip .)

# Deploy
cd ../infra/aws
terraform init -backend-config="bucket=<state bucket from bootstrap>" -backend-config="region=us-east-1"
terraform apply \
  -var connection_string="..." \
  -var r2_service_url="..." -var r2_access_key_id="..." -var r2_secret_access_key="..." \
  -var r2_bucket_name="..." -var r2_public_base_url="..." \
  -var cron_secret="..."

aws s3 sync ../../frontend/.output/public "s3://$(terraform output -raw static_assets_bucket)" --delete
```

## Redeploying after a code change

Push to `aws-main` — CI handles the rest. `terraform apply` picks up new
zips via `source_code_hash`, so no `-replace` flag is needed.

## Custom domain

Not configured — the app is reachable at the distribution's own
`*.cloudfront.net` domain. To add one: an ACM certificate (in `us-east-1`,
required for CloudFront) + a Route53 (or external DNS) record pointing at
the distribution, plus `aliases`/`viewer_certificate` on
`aws_cloudfront_distribution.main` in `cloudfront.tf`.

## Notes

- Resource tagging: every resource is tagged `Project = come-rico` via the
  AWS provider's `default_tags` (`versions.tf`), so everything this stack
  owns is correlatable for cost tracking/cleanup without repeating tags on
  each resource.
- Architecture note for `sharp`/`@vercel/og`: the frontend's native
  dependencies are architecture- and Node-ABI-specific. If you change
  `lambda_architecture` (x86_64 → arm64) or `frontend_node_runtime`, the
  `npm install --omit=dev` step (CI or manual) must run on a matching
  platform/Node version, or the Lambda will fail at runtime trying to load
  the native binary.
- `CRON_SECRET`, R2 credentials, and the Neon connection string are stored
  as plain Lambda environment variables for simplicity. Move them to AWS
  Secrets Manager if that becomes a requirement.
- Cold starts: the backend (self-contained, custom runtime, no
  ReadyToRun/AOT) is slower to cold-start than a managed dotnet runtime
  would be. If this becomes a problem, look at `PublishReadyToRun=true`
  (needs a matching RID) or Native AOT (`-p:PublishAot=true`, if the app's
  dependencies support it — EF Core's reflection-heavy startup usually
  doesn't out of the box).
