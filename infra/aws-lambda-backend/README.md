# Backend on AWS Lambda (always-free tier)

Provisions the ComeRico backend as a Lambda container image behind a Lambda
Function URL (not API Gateway, to stay in Lambda's always-free allowance —
API Gateway's free tier is 12-months-for-new-accounts only). A weekly
EventBridge Scheduler job replaces Vercel Cron for `/api/images/cleanup`.

Neon (Postgres) and Cloudflare R2 are unchanged — only the compute moves.
The frontend stays on Vercel; `vercel.json`'s `/api/(.*)` rewrite should point
at this stack's `function_url` output so the browser only ever talks to the
Vercel origin (same-origin cookies, no CORS changes needed).

## First-time deploy

```bash
cd infra/aws-lambda-backend
terraform init

# Provide required variables — copy to terraform.tfvars (gitignored) or pass -var
cat > terraform.tfvars <<'EOF'
connection_string    = "Host=...;Port=5432;Database=...;Username=...;Password=..."
r2_service_url       = "https://<account_id>.r2.cloudflarestorage.com"
r2_access_key_id     = "..."
r2_secret_access_key = "..."
r2_bucket_name       = "..."
r2_public_base_url   = "https://..."
cron_secret          = "..."
EOF

# 1. Create the ECR repo (and everything else) once, so we have somewhere to push to.
terraform apply -target=aws_ecr_repository.backend

# 2. Build and push the image
aws ecr get-login-password --region "$(terraform output -raw aws_region 2>/dev/null || echo us-east-1)" \
  | docker login --username AWS --password-stdin "$(terraform output -raw ecr_repository_url | cut -d/ -f1)"
docker build -f ../../backend/Dockerfile.lambda -t "$(terraform output -raw ecr_repository_url):latest" ../../backend
docker push "$(terraform output -raw ecr_repository_url):latest"

# 3. Deploy the Lambda function, Function URL, and cron
terraform apply
```

Grab the `function_url` output and cut the frontend over in the root
`vercel.json`:

```jsonc
{
  "services": {
    "frontend": { "root": "frontend", "framework": "tanstack-start" }
    // remove the "backend" service block entirely — it no longer deploys via Vercel
  },
  // remove the "crons" entry — replaced by the EventBridge Scheduler job above
  "rewrites": [
    { "source": "/api/(.*)", "destination": "<function_url output>api/$1" },
    { "source": "/(.*)", "destination": { "service": "frontend" } }
  ]
}
```

Only make this change once the Lambda function is deployed and reachable —
until then, `vercel.json` should keep pointing `/api/*` at the existing
Vercel `backend` service so the live site keeps working.

## Redeploying after a code change

```bash
docker build -f ../../backend/Dockerfile.lambda -t "$(terraform output -raw ecr_repository_url):latest" ../../backend
docker push "$(terraform output -raw ecr_repository_url):latest"
terraform apply -replace=aws_lambda_function.backend
```

(`-replace` forces Lambda to pick up the new image at the same tag; without
it Terraform won't detect that `latest` now points at different image
digest.)

## Notes

- State is local (`terraform.tfstate`) by default — fine to start, but not
  shared across machines/CI. Move to an S3 backend if that becomes a
  problem.
- Migrations are unaffected — they still run via
  `.github/workflows/migrate-database.yml` (`dotnet ef database update`)
  directly against Neon, independent of where the app runtime lives.
- `CRON_SECRET`, R2 credentials, and the Neon connection string are stored
  as plain Lambda environment variables here for simplicity. Move them to
  AWS Secrets Manager (referenced via `environment.variables` pointing at a
  secret ARN, or Lambda's native Secrets Manager extension) if that's a
  requirement.
