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
        │   └── signalr.ts    # SignalR connection helpers
        ├── server/
        │   └── auth.ts       # fetchCurrentUser server fn (reads session on the Start server)
        └── routes/
            ├── __root.tsx    # beforeLoad reads the session into router context
            ├── index.tsx     # Home page
            ├── login.tsx     # Login / register (redirects away when authenticated)
            ├── household.tsx # Create/join household + invite code
            ├── dishes.tsx    # Dishes CRUD (protected via beforeLoad redirect)
            └── roulette.tsx  # Real-time roulette (protected via beforeLoad redirect)
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
- Data Protection keys persist in the shared database (`DataProtectionKeys` table via `PersistKeysToDbContext`), so cookies stay valid across container instances/restarts. In-memory keys caused random session loss in production.
- **Frontend session (TanStack Start pattern):** `fetchCurrentUser` (`createServerFn` in `src/server/auth.ts`) forwards the request cookie to `/api/auth/me` on the Start server; the root route's `beforeLoad` puts the user into router context, and protected routes throw `redirect({ to: '/login' })` when missing. SSR, reloads, and client navigations all share the same auth state — never store the session in client-only React state.

### Multi-Tenancy (Household Isolation)
- Global Query Filters are applied automatically to **every entity implementing `IHasHousehold`** (`Dish`, `RouletteSession`, `Ingredient`, `Tag`, `MealPlan`, `ShoppingItem`) via `ModelBuilderExtensions.ApplyHouseholdFilters` — new tenant-scoped entities only need to implement the interface.
- `ITenantService` is resolved per HTTP request via `ClaimsTenantService` — it reads the `household_id` claim from the validated auth cookie (never client-supplied headers).
- `RequiresHousehold` policy = authenticated user + `household_id` claim present.
- Note: `PendingModelChangesWarning` is suppressed in `Program.cs` — the tenant query filters capture a scoped service, which makes the runtime model never match the snapshot exactly (false positive).

### Mediator Pattern
- All business logic lives in `ComeRico.Core/Features/**` as MediatR `IRequestHandler<,>`.
- The API layer (`ComeRico.Api/Endpoints/`) maps HTTP routes → MediatR commands/queries.
- Validation is enforced by `ValidationBehavior<,>` in the MediatR pipeline before any handler executes.

### Meal Planning & Shopping (domain rules)
- `Dish` owns `Ingredient`s (name + `decimal Amount` + `MeasurementUnit` enum — closed unit set so amounts can be summed) and has a many-to-many with `Tag` (unique per household by name).
- `MealPlan` schedules a dish on a `DateOnly` + `MealType` (Breakfast/Lunch/Dinner).
- `ShoppingItem` is either manual or auto-generated: `POST /api/shopping-items/generate` consolidates the week's planned ingredients (grouped case-insensitively by name + unit, Monday-based week stored in `GeneratedForWeekStart`); regeneration replaces only that week's auto items, never manual ones.
- Roulette spins exclude dishes that won in the last 3 days unless no other dish remains.
- Enums serialize as strings (`ConfigureHttpJsonOptions` + `JsonStringEnumConverter`) so the Hey-API client emits string literal unions.
- **EF gotcha:** entities with client-generated Guid keys discovered only through a navigation are tracked as `Modified`, not `Added` — always `Add`/`RemoveRange` child entities through their `DbSet` (see `SetDishIngredients`).

### File Uploads (Cloudflare R2, presigned)
- **Ticket flow:** `POST /api/images` (`RequiresHousehold`, JSON `{contentType, sizeBytes}`) creates a `StoredFile` row (`Pending`) and returns `{uploadId, uploadUrl, fields}` — a presigned POST (`CreatePresignedPostAsync`, 15 min) whose signed policy enforces `Content-Type` (`ExactMatchCondition`) and the size range (`ContentLengthRangeCondition`) **at the storage layer**. The browser submits multipart/form-data with all `fields` plus the file (last) **directly to R2** (no upload traffic through the API); the bucket needs a CORS rule allowing POST for that to work.
- Create/UpdateDish receive `imageUploadId` (the `StoredFile` id, never a storage path — clients can't choose keys); the handler resolves it via `ResolveUploadAsync` (tenant-filtered, flips to `Active`, returns the public URL stored in `Dish.ImageUrl`). `UpdateDishRequest`: `imageUploadId` null keeps the current image, `removeImage: true` drops it.
- `R2FileStorage` (`ComeRico.Api/Services`, implements `IFileStorage` from Core) configures `AmazonS3Client` with `ServiceURL` from config and checksums `WHEN_REQUIRED` (required for R2), per https://developers.cloudflare.com/r2/examples/aws/aws-sdk-net/.
- Config lives in the `R2` section (`ServiceUrl` — the full `https://{accountId}.r2.cloudflarestorage.com` endpoint —, `AccessKeyId`, `SecretAccessKey`, `BucketName`, `PublicBaseUrl`); locally secrets live in dotnet user-secrets (mirroring the root `.env`), in production env vars (`R2__ServiceUrl`, …). `PublicBaseUrl` is the bucket's r2.dev subdomain or custom domain and must allow public reads.
- Object keys are `dishes/{householdId}/{guid}.{ext}`; `CreateUploadCommand`'s validator enforces content type (JPG/PNG/WebP/AVIF/GIF) and the 5 MB limit (see `UploadRules`).
- **Orphan GC (mark-and-sweep):** replacing/removing a dish image marks the old `StoredFile` `Orphaned`. `GET /api/images/cleanup` (invoked by Vercel Cron weekly, authenticated with `Authorization: Bearer {CRON_SECRET}` — not a user cookie; it runs cross-tenant with `IgnoreQueryFilters`) deletes blobs+rows that are `Orphaned` or `Pending` older than 2h (tickets never consumed). External/legacy image URLs have no `StoredFile` row and are ignored.

### SignalR Hub Design
- `RouletteHub` is `[Authorize]`d; on connect it joins the socket to the `household-{id}` group resolved from the cookie's `household_id` claim (never a client-passed id).
- Business logic (spinning, selecting winner) is a MediatR command in `Core`.
- After the command completes, `RouletteEndpoints` broadcasts the result via `IHubContext<RouletteHub>`.

### Frontend ↔ Backend Communication
- **REST** (`/api/*`) for CRUD operations — in dev, proxied via Nitro's `devProxy` (configured on the `nitro()` plugin in `vite.config.ts`; Vite's own `server.proxy` is NOT used because the Nitro dev server handles requests first). In production, `vercel.json` rewrites route these paths to the backend service.
- **WebSocket** (`/hubs/roulette`) for real-time roulette events — same proxying.

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
