# WorkOS AuthKit setup

WorkOS AuthKit is the identity provider (issue #62). There is no official
Terraform provider for it, so each WorkOS environment is configured by hand
in the [dashboard](https://dashboard.workos.com), following these steps.
What the app does with it is described in `AGENTS.md` (Authentication).

| App environment | WorkOS environment | Backend (callback host)        | Frontend                     |
| --------------- | ------------------ | ------------------------------ | ---------------------------- |
| Local           | Staging            | `http://localhost:5276`        | `http://localhost:3000`      |
| Development     | Staging            | dev Lambda Function URL        | `main` branch alias (Vercel) |
| Production      | Production         | prod Lambda Function URL       | `https://<base_domain>`      |

The callback lives on the **backend's** host, not the frontend's: the
browser talks to the API cross-origin, and the session cookie has to be set
by the host that reads it. Get the Function URLs with
`terragrunt output` in `infra/live/dev` / `infra/live/prod`.

## Steps (repeat per WorkOS environment)

1. **Authentication → enable AuthKit.** Keep the default `*.authkit.app`
   domain (the custom domain is a paid add-on we don't use).
2. **Authentication → Sign up: disable.** Registration is by invitation
   only; an invitation link is what opens sign-up for one person.
3. **Authentication → Methods:** email + password and Google OAuth (plus
   passkeys / MFA as wanted). Leave email verification on — the backend
   refuses to match or create an account for an unverified email.
4. **Authentication → Features → Localization:** default language Spanish.
5. **Applications → (the app) → Redirects:**
   - **Redirect URIs:** `<backend>/api/auth/callback` (set as default).
     Staging also gets `http://localhost:5276/api/auth/callback`.
   - **Sign-in endpoint:** `<backend>/api/auth/login`. Used when a flow
     starts at AuthKit instead of in our app (an accepted invitation).
   - **Sign-out redirects:** `<frontend>/login` (set as default). Staging
     also gets `http://localhost:3000/login`.
   - **User invitation URL:** leave the default (AuthKit's own page).
6. **API Keys:** copy the secret key (`sk_…`) and the client id
   (`client_…`).
   - Development / Production: store them in Infisical, in that
     environment's `/` folder, as `WORKOS_API_KEY` and `WORKOS_CLIENT_ID`,
     then `terragrunt apply` (`stack/lambda.tf` passes them to the function
     as `WorkOS__ApiKey` / `WorkOS__ClientId`).
   - Local: `dotnet user-secrets set "WorkOS:ApiKey" "sk_…"` and
     `"WorkOS:ClientId" "client_…"` in `backend/ComeRico.Api`.

## Inviting people

**Users → Invite user** in the dashboard (no organization). WorkOS emails the
link; the person creates their account at AuthKit and, on their first login,
the backend creates their `AppUser`. They then create a household or join
one with its invite code.

## Moving the existing accounts (once per environment)

Accounts created before AuthKit keep their data: invite each person **with
the same email** they registered with. On their first AuthKit login the
backend links the existing account by (verified) email — household, role and
data stay as they were. Their old password is not migrated; they choose a
new sign-in method when accepting the invitation.

Sessions opened before the deploy keep working until they expire or sign
out; after that the only way in is AuthKit, so send the invitations before
(or right after) deploying.

## Local development without a WorkOS account

The [WorkOS emulator](https://github.com/workos/emulate) implements the same
API in memory:

```bash
npx @workos/emulate --interactive   # http://localhost:4100, key sk_test_default
```

```bash
cd backend/ComeRico.Api
dotnet user-secrets set "WorkOS:ApiBaseUrl" "http://localhost:4100"
dotnet user-secrets set "WorkOS:ApiKey" "sk_test_default"
dotnet user-secrets set "WorkOS:ClientId" "client_local"
```

Seed users with a `--seed` YAML file (`users: [{ email, first_name,
email_verified: true }]`).
