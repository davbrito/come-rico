# AGENTS.md — ComeRico Project Context

This file is the durable context file for AI agents and contributors working on the **ComeRico** project. Keep it up to date after significant architectural changes.

---

## 1. Project Overview

**ComeRico** is a domestic/family application to plan meals and resolve culinary indecision via a real-time synchronized roulette. Target audience: families and households. Primary language for user-facing features: **Spanish**.

---

## 2. Monorepo Structure

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

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Backend Framework | ASP.NET Core 10 — **Minimal APIs only** (controllers forbidden) |
| ORM | Entity Framework Core 9 + Npgsql (PostgreSQL) |
| Mediator | MediatR 12 — Commands/Queries in `ComeRico.Core` |
| Validation | FluentValidation 11 — via MediatR pipeline behavior |
| Real-time | ASP.NET Core SignalR — Hubs broadcast only, no business logic |
| Frontend | TanStack Start (React 19 + Vite 8 + TanStack Router) |
| Styling | Tailwind CSS 4 |
| Package Manager | **pnpm** (frontend only) |
| Database | PostgreSQL |

---

## 4. Scaffolding Commands (for reference / re-creation)

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

## 5. Architecture Decisions

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
- Backend URL defaults to `http://localhost:5000`; override with `BACKEND_URL` env var.

---

## 6. Environment Variables

### Backend (`backend/ComeRico.Api/appsettings.json`)

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=comerico;Username=postgres;******"
  },
  "AllowedOrigins": {
    "ViteDev": "http://localhost:3000"
  }
}
```

> **Note:** Set the real password in user secrets (`dotnet user-secrets`) or an environment variable `ConnectionStrings__DefaultConnection`. Never commit real credentials.

### Frontend

| Variable | Default | Description |
|---|---|---|
| `BACKEND_URL` | `http://localhost:5000` | .NET API base URL for Vite proxy |

---

## 7. Running the Project Locally

### Prerequisites
- .NET 10 SDK
- PostgreSQL 15+
- Node.js 22+, pnpm 11+

### Backend

```bash
cd backend/ComeRico.Api
# Set DB password via user secrets (recommended)
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Port=5432;Database=comerico;Username=postgres;******"
dotnet run
# API: http://localhost:5000
# OpenAPI: http://localhost:5000/openapi/v1.json
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
# App: http://localhost:3000
```

---

## 8. EF Core Migrations

```bash
cd backend/
# Create a migration
dotnet ef migrations add <MigrationName> --project ComeRico.Core --startup-project ComeRico.Api

# Apply to DB
dotnet ef database update --project ComeRico.Core --startup-project ComeRico.Api
```

> The API auto-migrates in the `Development` environment on startup (`db.Database.MigrateAsync()`).

---

## 9. Lint / Build / Test Commands

```bash
# Backend
dotnet build backend/ComeRico.slnx

# Frontend type-check
cd frontend && pnpm exec tsc --noEmit

# Frontend tests (Vitest)
cd frontend && pnpm test
```

---

## 10. Known Issues & Next Steps

- **Authentication:** Currently uses `X-Household-Id` header for tenant resolution. Replace with JWT-based auth (e.g., ASP.NET Core Identity or an OIDC provider) before any production deployment.
- **Authorization Policy:** `RequiresHousehold` policy is a placeholder; it should validate the JWT claim matches the household being accessed.
- **Microsoft.OpenApi warning:** `NU1903` warning is a transitive dependency from `Microsoft.AspNetCore.OpenApi`. Monitor for an upstream fix.
- **Frontend household setup:** Household creation/selection UI is not yet implemented; `householdId` is read from `localStorage`. Build a proper onboarding flow.
- **EF Core migrations:** No initial migration has been applied yet. Run `dotnet ef migrations add InitialCreate ...` before first use.
- **Tests:** No automated tests yet. Add xUnit for backend and Vitest for frontend.

---

## 11. TanStack Intent — Skill Mappings

<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
<!-- intent-skills:end -->
