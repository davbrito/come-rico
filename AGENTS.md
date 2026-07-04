# AGENTS.md — ComeRico Project Context

This file is the durable context file for AI agents and contributors working on the **ComeRico** project. Keep it up to date after significant architectural changes. For project overview, setup, and run commands, see [README.md](README.md).

---

## 1. Monorepo Structure

```text
come-rico/                    # Root (all lowercase)
├── AGENTS.md                 # This file — durable agent context
├── .gitignore
├── backend/
│   ├── ComeRico.slnx         # Solution file (.NET 10 slnx format)
│   ├── ComeRico.Api/         # ASP.NET Core Web API (Minimal APIs + SignalR Hubs)
│   └── ComeRico.Core/        # Domain Entities, EF Core DbContext, MediatR Handlers
└── frontend/                 # TanStack Start project (React + Vite + Tailwind)
    ├── AGENTS.md             # TanStack Intent skill mappings (auto-generated)
    └── src/
        ├── lib/
        │   ├── api.ts        # Typed REST API client (cookie-based, same-origin)
        │   ├── auth.tsx      # AuthProvider + useAuth (session state from /api/auth/me)
        │   └── signalr.ts    # SignalR connection helpers
        └── routes/
            ├── index.tsx     # Home page
            ├── login.tsx     # Login / register
            ├── household.tsx # Create/join household + invite code
            ├── dishes.tsx    # Dishes CRUD
            └── roulette.tsx  # Real-time roulette
```

---

## 2. Scaffolding Commands (for reference / re-creation)

### Frontend — TanStack CLI

```bash
# Run from the repo root (creates come-rico-frontend in /tmp, then merged into /frontend)
npx @tanstack/cli@latest create come-rico-frontend --agent --package-manager pnpm --tailwind

# TanStack Intent setup (run from frontend/)
npx @tanstack/intent@latest install
npx @tanstack/intent@latest list
```

### Backend — .NET CLI

```bash
cd backend/
dotnet new sln -n ComeRico
dotnet new classlib -n ComeRico.Core --framework net10.0
dotnet new webapi  -n ComeRico.Api  --framework net10.0
dotnet sln add ComeRico.Core/ComeRico.Core.csproj
dotnet sln add ComeRico.Api/ComeRico.Api.csproj
```

---

## 3. Architecture Decisions

### API Style
- **Minimal APIs only** — controllers are forbidden.

### Authentication (BFF pattern)
- ASP.NET Core Identity with `AppUser : IdentityUser<Guid>` (`DisplayName`, nullable `HouseholdId`, `Role` Admin/Member).
- Cookie-based session (`comerico.auth`, HttpOnly, SameSite=Lax) — the BFF pattern: no tokens ever reach browser JavaScript; the frontend proxies `/api` and `/hubs` to the backend on the same origin and the cookie rides along automatically.
- `AppUserClaimsPrincipalFactory` stamps `household_id`, `household_role`, and `display_name` claims into the cookie. After create/join household, the endpoint calls `RefreshSignInAsync` to re-issue the cookie with fresh claims.
- Endpoints: `POST /api/auth/register|login|logout`, `GET /api/auth/me`, `POST /api/households`, `POST /api/households/join` (invite code).
- Cookie auth events return 401/403 JSON instead of login-page redirects.

### Multi-Tenancy (Household Isolation)
- Global Query Filters on `Dish` and `RouletteSession` filter automatically by `HouseholdId`.
- `ITenantService` is resolved per HTTP request via `ClaimsTenantService` — it reads the `household_id` claim from the validated auth cookie (never client-supplied headers).
- `RequiresHousehold` policy = authenticated user + `household_id` claim present.
- Note: `PendingModelChangesWarning` is suppressed in `Program.cs` — the tenant query filters capture a scoped service, which makes the runtime model never match the snapshot exactly (false positive).

### Mediator Pattern
- All business logic lives in `ComeRico.Core/Features/**` as MediatR `IRequestHandler<,>`.
- The API layer (`ComeRico.Api/Endpoints/`) maps HTTP routes → MediatR commands/queries.
- Validation is enforced by `ValidationBehavior<,>` in the MediatR pipeline before any handler executes.

### SignalR Hub Design
- `RouletteHub` is `[Authorize]`d; on connect it joins the socket to the `household-{id}` group resolved from the cookie's `household_id` claim (never a client-passed id).
- Business logic (spinning, selecting winner) is a MediatR command in `Core`.
- After the command completes, `RouletteEndpoints` broadcasts the result via `IHubContext<RouletteHub>`.

### Frontend ↔ Backend Communication
- **REST** (`/api/*`) for CRUD operations — proxied by Vite dev server to `.NET` backend.
- **WebSocket** (`/hubs/roulette`) for real-time roulette events — also proxied with `ws: true`.

---

## 5. Known Issues & Next Steps

- **CSRF:** SameSite=Lax on the auth cookie blocks cross-site POSTs, which is a solid baseline for a JSON API. For defense in depth, add antiforgery tokens or require a custom header on mutating requests.
- **Production cookies:** `CookieSecurePolicy.SameAsRequest` is dev-friendly; enforce `Always` (HTTPS-only) in production.
- **Email confirmation / password reset:** Not implemented; `AddDefaultTokenProviders()` is already wired for when they're needed.
- **Tests:** No automated tests yet. Add xUnit for backend and Vitest for frontend.
- **Database config:** The backend prefers a URI-style `DATABASE_URL` (Neon/Vercel format, converted by `ConnectionStringResolver`) and falls back to `ConnectionStrings:DefaultConnection`.
- **Migrations policy:** Migrations run exclusively via the dotnet CLI (`dotnet ef database update --project ComeRico.Core --startup-project ComeRico.Api`). The app never auto-migrates at startup, in any environment.

---

## 6. TanStack Intent — Skill Mappings

<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
<!-- intent-skills:end -->
