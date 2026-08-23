# infra/stack — Terraform module

This is the Terraform **module**: no backend block, no per-environment
values baked in. It's never applied directly — always through Terragrunt
(`../root.hcl`, `../live/<env>/`), which supplies `environment` and
every other input and generates the remote-state backend per environment.
See `../README.md` for how to actually run `plan`/`apply`.

Manages, per environment (`var.environment`):

- **AWS Lambda**: IAM execution role, CloudWatch log group, and the
  function + Function URL described in `../aws.md` (`lambda.tf`)
- **Neon**: a Postgres project/branch/database/role (see
  [neon.com/docs/reference/terraform](https://neon.com/docs/reference/terraform))
- **Cloudflare R2**: the image storage bucket, its CORS policy, and a
  custom domain (`storage-<environment>.<base_domain>`, e.g.
  `storage-prod.comerico.davbrito.dev` by default)

State lives in Cloudflare R2, not locally — see
`../root.hcl`'s `remote_state` block, not this module.

## Naming

Flat `<workload>-<environment>[-<suffix>]`, e.g. `come-rico-prod` — Lambda
function names are unique per AWS account+region on their own, so unlike
the old Azure CAF convention there's no resource-group-scoped prefix
needed. `environment` (and everything else) comes from
`../live/<env>/terragrunt.hcl` — that's what defines each environment as a
fully separate stack, with its own state path.

`app_name_unique_suffix` still exists for extra insurance against a name
collision, but disable it once you've confirmed the plain name works and
want a stable name (already done for `prod`, see
`../live/prod/terragrunt.hcl`).

Outputs `app_hostname` (the Lambda Function URL) — wire it into the Vercel
routes and the `BACKEND_URL` Vercel env var, as described in `../aws.md`.
This value is only known after the first `terragrunt apply`.

## What's still manual

- **Database migrations** — still `migrate-database.yml`, unrelated to
  provisioning.
- **The actual code deploy** — Terraform seeds the Lambda function with a
  trivial placeholder zip (see `lambda.tf`); `deploy-backend.yml` is what
  actually ships the built API via `aws lambda update-function-code`, and
  `lifecycle.ignore_changes` keeps Terraform from reverting that on the
  next apply.

## CI/CD

`deploy-backend.yml` and `migrate-database.yml` authenticate to AWS via
one shared OIDC provider — created once by `../modules/aws_oidc` as its
own Terragrunt unit (`../live/platform/aws-oidc`), not inside either
environment's own state (AWS allows only one OIDC provider per issuer URL
per account, same one-per-account constraint the old Azure AD app
sidestepped by being shared too). Everything environment-_specific_ lives
in this directory's `ci.tf` instead, applied once per environment
(`../live/dev`, `../live/prod`), pulling the shared provider's ARN in via
a Terragrunt `dependency` block:

- An IAM role with a trust policy scoped to _this_ environment's GitHub
  Environment (`var.github_environment_name` — `"Production"` for `prod`,
  `"Development"` for `dev`; set in `../live/<env>/terragrunt.hcl`) — not
  a branch ref, so it only trusts runs that went through that
  environment's protection rules
- A policy granting `lambda:UpdateFunctionCode`/`GetFunction`/
  `GetFunctionConfiguration` on _this_ environment's own function only
- The GitHub Environment itself (`github_repository_environment`)
- Its variables — `AWS_ROLE_ARN`, `AWS_REGION`, `AWS_LAMBDA_FUNCTION_NAME`
  — and its `ConnectionStrings__DefaultConnection` secret, all pushed via
  the `github` provider so nothing needs copy-pasting from
  `terraform output` by hand

`AWS_LAMBDA_FUNCTION_NAME` needs to be stable across applies, so prod sets
`app_name_unique_suffix = false` once the plain name is confirmed free
(see [Naming](#naming)) — otherwise a suffix rotation would need Terraform
to re-push the variable (which it will, on the next apply, but the two
would be out of sync until then).

Applying `../live/platform/aws-oidc` and either env's `ci.tf` needs an AWS
account with permission to create IAM OIDC providers, roles, and policies
— plus `gh auth login` run locally, same as before (the `github` provider
picks up its token from the gh CLI automatically; the logged-in account
needs admin on this repo to write Environments, Secrets, and Variables).

## Vercel (frontend)

Not managed here — like the CI identity, there's exactly one Vercel
project (`come-rico`), not one per environment, so it lives in
`../modules/vercel` as its own Terragrunt unit (`../live/platform/vercel`),
not this stack. It depends on both `../live/prod`'s and `../live/dev`'s
`app_hostname` outputs (via Terragrunt `dependency` blocks): the
production Vercel deployment (host matches `base_domain`) routes to prod,
every other deployment (previews, the default `*.vercel.app` alias)
routes to dev as a staging target — both the `BACKEND_URL` env var and the
`/api/*` rewrite are split this way, built from those `dependency`
outputs. Dev also sets `app_name_unique_suffix = false` (see
[Naming](#naming), same as prod) — not strictly required for this, but a
stable name makes for a nicer staging URL. See
`../modules/vercel/vercel.tf` for the full picture, including why the
dependency has to point *at* prod/dev rather than the other way around
(the CI provider's dependency already runs the other direction).

The `/api/(.*)` rewrite is a `vercel_project_route` resource in
`../modules/vercel/vercel.tf`, not a static `vercel.json` entry — its
`dest` field is a hardcoded literal (the Vercel provider panics on an
interpolated one), so it needs a one-time hand-edit to the real
`app_hostname` after each environment's first apply; see the comment on
those resources.

## Secrets

`infisical.tf` reads externally-issued tokens that Terraform can't
generate itself, per environment (`data "infisical_secrets"`, `env_slug =
var.environment`, `folder_path = "/"`). Nothing currently consumes it —
the AWS Lambda migration dropped the one thing that used to (`GHCR_PAT`, a
registry pull credential with no Lambda equivalent) — but it's kept wired
up (provider, data source, `infisical_project_id` variable) for whatever
gets added next.

## Changing settings later

`aws_lambda_function.api`'s `environment` block in `lambda.tf` is the
single source of truth for the function's config now — don't hand-edit
them in the AWS Console or with `aws lambda update-function-configuration`,
and don't hand-edit the Neon branch/role/database or R2 bucket in their
dashboards either; `terraform apply` will revert manual changes on the
next run (by design). The one deliberate exception is the function's code
itself — `lambda.tf`'s `lifecycle.ignore_changes` lets
`deploy-backend.yml` move it via `aws lambda update-function-code` without
Terraform fighting it back to the placeholder zip seeded on the first
apply.
