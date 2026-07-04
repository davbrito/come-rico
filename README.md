# ComeRico

A domestic/family app to plan meals and resolve culinary indecision via a real-time synchronized roulette. Built for households; user-facing copy is in Spanish.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend Framework | ASP.NET Core 10 — Minimal APIs |
| ORM | Entity Framework Core 10 + Npgsql (PostgreSQL) |
| Mediator | MediatR 14 |
| Validation | FluentValidation 12 |
| Real-time | ASP.NET Core SignalR |
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
# API: http://localhost:5000
# OpenAPI: http://localhost:5000/openapi/v1.json
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
| `BACKEND_URL` | `http://localhost:5000` | .NET API base URL for the Vite dev proxy |

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
