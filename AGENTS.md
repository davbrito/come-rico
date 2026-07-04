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
        │   ├── api.ts        # Typed REST API client
        │   └── signalr.ts    # SignalR connection helpers
        └── routes/
            ├── index.tsx     # Home page
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

### Multi-Tenancy (Household Isolation)
- Global Query Filters on `Dish` and `RouletteSession` filter automatically by `HouseholdId`.
- `ITenantService` is resolved per HTTP request via `HttpTenantService` (reads `X-Household-Id` header).
- **Production upgrade path:** Replace header-based resolution with a validated JWT claim.

### Mediator Pattern
- All business logic lives in `ComeRico.Core/Features/**` as MediatR `IRequestHandler<,>`.
- The API layer (`ComeRico.Api/Endpoints/`) maps HTTP routes → MediatR commands/queries.
- Validation is enforced by `ValidationBehavior<,>` in the MediatR pipeline before any handler executes.

### SignalR Hub Design
- `RouletteHub` only handles group join/leave.
- Business logic (spinning, selecting winner) is a MediatR command in `Core`.
- After the command completes, `RouletteEndpoints` broadcasts the result via `IHubContext<RouletteHub>`.

### Frontend ↔ Backend Communication
- **REST** (`/api/*`) for CRUD operations — proxied by Vite dev server to `.NET` backend.
- **WebSocket** (`/hubs/roulette`) for real-time roulette events — also proxied with `ws: true`.

---

## 5. Known Issues & Next Steps

- **Authentication:** Currently uses `X-Household-Id` header for tenant resolution. Replace with JWT-based auth (e.g., ASP.NET Core Identity or an OIDC provider) before any production deployment.
- **Authorization Policy:** `RequiresHousehold` policy is a placeholder; it should validate the JWT claim matches the household being accessed.
- **Frontend household setup:** Household creation/selection UI is not yet implemented; `householdId` is read from `localStorage`. Build a proper onboarding flow.
- **EF Core migrations:** No initial migration has been applied yet. Run `dotnet ef migrations add InitialCreate ...` before first use.
- **Tests:** No automated tests yet. Add xUnit for backend and Vitest for frontend.

---

## 6. TanStack Intent — Skill Mappings

<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
<!-- intent-skills:end -->
