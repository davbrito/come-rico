# ComeRico

A domestic/family app to plan meals: manage dishes, schedule a weekly meal plan, and generate a shopping list. Built for households; user-facing copy is in Spanish.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend Framework | ASP.NET Core 10 — Minimal APIs |
| ORM | Entity Framework Core 10 + Npgsql (PostgreSQL) |
| Mediator | MediatR 14 |
| Validation | FluentValidation 12 |
| Frontend | TanStack Start (React 19 + Vite 8 + TanStack Router) |
| Styling | Tailwind CSS 4 |
| Package Manager | pnpm (frontend only) |
| Database | PostgreSQL |

## Prerequisites

- .NET 10 SDK
- PostgreSQL 15+
- Node.js 22+, pnpm 11+

## Running Locally

### Backend

```bash
cd backend/ComeRico.Api
# Set DB password via user secrets (recommended)
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Port=5432;Database=comerico;Username=postgres;******"
dotnet run
# API: http://localhost:5276
# OpenAPI: http://localhost:5276/openapi/v1.json
```

> Never commit real credentials — set them via user secrets or the `ConnectionStrings__DefaultConnection` environment variable.

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
# App: http://localhost:3000
```

| Variable | Default | Description |
|---|---|---|
| `BACKEND_URL` | `http://localhost:5276` | .NET API base URL for the Vite dev proxy |

## EF Core Migrations

```bash
cd backend/
# Create a migration
dotnet ef migrations add <MigrationName> --project ComeRico.Core --startup-project ComeRico.Api

# Apply to DB
dotnet ef database update --project ComeRico.Core --startup-project ComeRico.Api
```

> The API auto-migrates in the `Development` environment on startup (`db.Database.MigrateAsync()`).

## Lint / Build / Test

```bash
# Backend
dotnet build backend/ComeRico.slnx

# Frontend type-check
cd frontend && pnpm exec tsc --noEmit

# Frontend tests (Vitest)
cd frontend && pnpm test
```

## Deployment

| Piece | Host |
|---|---|
| Frontend (TanStack Start SSR) | Cloudflare Workers |
| Images | Cloudflare R2 |
| Backend (ASP.NET Core) | Azure App Service (free F1) |
| Database | Neon (Postgres) |

All of it is defined in [`sst.config.ts`](sst.config.ts) and deployed with
`pnpm sst deploy` (CI does this on push to `main`). Everything runs on a
free tier — see [`infra/README.md`](infra/README.md) for setup, secrets, and
the reasoning. Migrating existing data onto the stack is covered in
[`docs/migration.md`](docs/migration.md).
