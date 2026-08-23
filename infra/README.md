# Infrastructure — come-rico

Terragrunt orchestrates four units, without duplicating config between
them:

- [`stack/`](stack) — the per-environment module (AWS Lambda, Neon, R2,
  and each environment's own GitHub Actions wiring — see its README).
  Applied twice, independently: `live/dev` and `live/prod`.
- [`modules/aws_oidc`](modules/aws_oidc) — a single GitHub Actions OIDC
  provider, shared by both environments' CI deploys. Applied once:
  `live/platform/aws-oidc`. Everything environment-*specific* about CI
  (the IAM role, its trust policy, the GitHub Environment itself) lives in
  `stack/ci.tf` instead, which reads this provider's ARN via a Terragrunt
  `dependency` block — see `stack/README.md#cicd`.
- [`modules/vercel`](modules/vercel) — the one Vercel project
  (`come-rico`), also shared rather than per-environment. Applied once:
  `live/platform/vercel`, which depends on both `live/prod`'s and
  `live/dev`'s `app_hostname` outputs — production Vercel traffic
  (host matches `base_domain`) routes to prod, everything else
  (previews, the default `*.vercel.app` alias) routes to dev as a
  staging target.

`live/platform/aws-oidc` and `live/platform/vercel` are deliberately two
separate units, not one — `live/dev`/`live/prod` both depend on `aws-oidc`
(for the provider), and `vercel` depends on `live/prod`/`live/dev` (for
their backend hostnames); merging them into a single "platform" unit
would make that a cycle (`prod` → `platform` → `prod`).

Config layout:

- `root.hcl` (this directory) — shared remote-state backend config
  and the handful of inputs that are identical across every environment
  (`base_domain`, `cloudflare_account_id`, `cloudflare_zone_id`,
  `infisical_project_id`).
- `live/dev/terragrunt.hcl`, `live/prod/terragrunt.hcl` — only what
  actually differs per environment (`environment`,
  `app_name_unique_suffix`, `github_environment_name`), plus
  `terraform { source = "../../stack" }` and a `dependency "platform"`
  block (`config_path = "../platform/aws-oidc"`) for the OIDC provider's
  ARN.
- `live/platform/aws-oidc/terragrunt.hcl` — `terraform { source = "../../../modules/aws_oidc" }`,
  no inputs of its own.
- `live/platform/vercel/terragrunt.hcl` — `terraform { source = "../../../modules/vercel" }`,
  plus `dependency "prod"` and `dependency "dev"` blocks for the
  prod/preview backend split.

This replaces the old setup (Terraform workspaces + `terraform.tfvars` /
`dev.tfvars` + a manually-maintained `backend.hcl`) — everything
environment-specific now lives in one small file per environment, and
`stack/` itself carries no backend block or hardcoded values at all;
it's never applied directly.

## Setup

1. Install [Terragrunt](https://terragrunt.gruntwork.io/docs/getting-started/install/)
   (and Terraform — already required by `stack/`).
2. `aws configure` / `AWS_PROFILE` set (AWS credentials with rights to
   create IAM roles/policies/OIDC providers and Lambda resources) and
   `gh auth login` (GitHub, needed by `stack/ci.tf` and
   `modules/aws_oidc`, both environments).
3. Bootstrap the state bucket once — Terragrunt can't create the bucket
   it's about to store its own state in:
   ```bash
   # Cloudflare dashboard → R2 → Create bucket → "come-rico-tfstate"
   # (or: npx wrangler r2 bucket create come-rico-tfstate)
   ```
4. Create an Infisical project with `NEON_API_KEY`, `CLOUDFLARE_API_TOKEN`,
   `VERCEL_API_TOKEN` under `dev` and `prod` environments (folder `/`) —
   `CRON_SECRET` gets created by the first `apply`, not by hand. Create a
   Universal Auth machine identity scoped read+write to that project (see
   `stack/README.md#infisical-provider-tokens` for what each secret
   is used for and why `CLOUDFLARE_API_TOKEN` needs
   `Account.API Tokens: Edit`).
5. Copy `.envrc.example` (this directory) to `.envrc`, fill in real
   values, `direnv allow`. It supplies:
   - `INFISICAL_UNIVERSAL_AUTH_CLIENT_ID` / `_CLIENT_SECRET` — the
     machine identity from step 4, authenticating the `infisical`
     Terraform provider.
   - `R2_TFSTATE_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` — R2 API token
     credentials for the state bucket itself (`remote_state` below).
   - `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `INFISICAL_PROJECT_ID`
     — read directly into this root `root.hcl`'s `inputs`.

## Usage

```bash
cd infra/live/platform/aws-oidc   # apply this first — dev/prod both depend on its outputs
terragrunt apply

cd infra/live/dev           # or live/prod
terragrunt apply

cd infra/live/platform/vercel   # last — depends on live/prod's and live/dev's output
terragrunt apply
```

`terragrunt` copies the relevant module (`stack/`,
`modules/aws_oidc`, or `modules/vercel`) into a
`.terragrunt-cache/` working directory, generates `backend.tf` there from
this root `root.hcl`'s `remote_state` block, and runs the equivalent
`terraform` command with `inputs` (from both the unit's own
`terragrunt.hcl` and the root) passed as variables.

To run something across every unit (rare — usually you want one at a
time), use `run-all` from this directory; it resolves the right order
automatically from the `dependency` blocks above (`aws-oidc` before
`dev`/`prod` before `vercel`):

```bash
cd infra
terragrunt run-all plan
```

## Remote state

One bucket (`come-rico-tfstate`), one state file per environment —
`remote_state.config.key` in `root.hcl` resolves to
`live/dev/terraform.tfstate` / `live/prod/terraform.tfstate` via
`path_relative_to_include()`. No `backend.hcl` file anymore; credentials
come from `.envrc` (see [Setup](#setup)).

## Adding an environment

Copy `live/dev/terragrunt.hcl` to `live/<new-env>/terragrunt.hcl`, change
`environment`. It picks up everything else (backend, `base_domain`,
Cloudflare/Infisical config) from the root automatically. Add the new
environment's secrets to the Infisical project (step 4 above) under a
matching environment slug.
