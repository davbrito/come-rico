# Backend on AWS Lambda (always-free tier)

Provisions the ComeRico backend as a Lambda function (zip package, custom
runtime) behind a Lambda Function URL (not API Gateway, to stay in Lambda's
always-free allowance — API Gateway's free tier is 12-months-for-new-accounts
only). A weekly EventBridge Scheduler job replaces Vercel Cron for
`/api/images/cleanup`.

The app hosts itself in Lambda via `Amazon.Lambda.AspNetCoreServer.Hosting`
(`builder.Services.AddAWSLambdaHosting(LambdaEventSource.HttpApi)` in
`Program.cs`) — no Docker/container image involved. Since net10.0 has no
AWS-managed Lambda runtime yet, it's published **self-contained** and
deployed on the `provided.al2023` custom runtime; the same code path falls
back to normal Kestrel hosting outside of Lambda (local dev, tests), so
nothing else changes.

Neon (Postgres) and Cloudflare R2 are unchanged — only the compute moves.
The frontend stays on Vercel; `vercel.json`'s `/api/(.*)` rewrite should point
at this stack's `function_url` output so the browser only ever talks to the
Vercel origin (same-origin cookies, no CORS changes needed).

## Building the deployment package

Custom runtimes require a file named exactly `bootstrap` at the zip root.

```bash
cd backend
dotnet publish ComeRico.Api/ComeRico.Api.csproj \
  -c Release \
  -r linux-x64 \
  --self-contained true \
  -p:PublishReadyToRun=false \
  -o publish

mv publish/ComeRico.Api publish/bootstrap
chmod +x publish/bootstrap

(cd publish && zip -r ../publish/function.zip . -x '*.pdb')
```

Use `-r linux-arm64` instead (and set `lambda_architecture = "arm64"` in
Terraform) for Graviton — cheaper and faster, no code changes needed either
way.

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
# from repo root — rebuild the zip (see "Building the deployment package" above)
cd infra/aws-lambda-backend
terraform apply
```

Terraform picks up the new zip automatically via `source_code_hash`
(`filebase64sha256(var.lambda_zip_path)`), so a plain `apply` after
rebuilding is enough — no `-replace` needed.

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
- Cold starts: a self-contained ASP.NET Core app on a custom runtime is
  slower to cold-start than a managed dotnet runtime would be (no
  ReadyToRun/AOT here). If cold starts become a problem, look at
  `PublishReadyToRun=true` (needs a matching RID) or Native AOT (`dotnet
  publish -p:PublishAot=true`, if the app's dependencies support it —
  EF Core's reflection-heavy startup usually doesn't out of the box).
