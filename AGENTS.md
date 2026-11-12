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
│   ├── ComeRico.Api/         # ASP.NET Core Web API (Minimal APIs)
│   └── ComeRico.Core/        # Domain Entities, EF Core DbContext, MediatR Handlers
└── frontend/                 # TanStack Start project (React + Vite + Tailwind)
    ├── AGENTS.md             # TanStack Intent skill mappings (auto-generated)
    └── src/
        ├── lib/
        │   └── api.ts        # Typed REST API client (cookie-based, same-origin)
        ├── server/
        │   └── auth.ts       # fetchCurrentUser server fn (reads session on the Start server)
        └── routes/
            ├── __root.tsx    # beforeLoad reads the session into router context
            ├── index.tsx     # Home page
            ├── login.tsx     # Login / register (redirects away when authenticated)
            ├── household.tsx # Create/join household + invite code
            └── dishes.tsx    # Dishes CRUD (protected via beforeLoad redirect)
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
- **Identity provider: WorkOS AuthKit** (hosted sign-in UI, MFA, Google, passkeys; setup in `infra/workos.md`). There are no passwords, registration or recovery screens of our own: sign-up is disabled in WorkOS and people get in **by invitation only** (sent from the WorkOS dashboard).
- `AppUser : IdentityUser<Guid>` (`DisplayName`, nullable `HouseholdId`, `Role` Admin/Member, unique nullable `WorkOsUserId`) is still our user + household model; ASP.NET Core Identity is only the user store and the session cookie (`AddIdentityCore` + `AddIdentityCookies`, no password/token endpoints). `PasswordHash` stays in the table, unused.
- **Login flow (BFF, `AuthEndpoints` + `ComeRico.Api/Auth`):** the browser *navigates* to `GET /api/auth/login?returnTo=…` → 302 to AuthKit → `GET /api/auth/callback?code&state` → the backend exchanges the code server-side (`WorkOsClient`, a thin wrapper over the official `WorkOS.net` SDK behind `IWorkOsClient`), `AuthKitUserProvisioner` finds the `AppUser` by `WorkOsUserId`, else links a pre-AuthKit account by **verified** email, else creates it, and we issue **our own cookie** → 302 to `returnTo`. No WorkOS token ever reaches the browser.
  - `LoginFlow` keeps the pending login in a short-lived encrypted cookie whose nonce is the OAuth `state` (login-CSRF protection). A callback we didn't start (e.g. AuthKit landing there after an accepted invitation) never redeems its code: it restarts the login once, towards `WorkOS:DefaultReturnUrl`.
  - `returnTo` must be an origin allowed by the CORS policy (`Cors:AllowedOrigins`) — the same trust list, no separate one.
  - `POST /api/auth/logout` signs our cookie out and returns `logoutUrl` (AuthKit's session logout, from the `sid` kept in the cookie's `AuthenticationProperties`); the frontend navigates there (`signOut` in `src/server/auth.ts`). `DELETE /api/auth/me` deletes the WorkOS user first, then ours.
  - Config: `WorkOS` section (`ApiKey`, `ClientId`, optional `RedirectUri` — derived from the request when empty —, `DefaultReturnUrl`, `ApiBaseUrl`). Locally use dotnet user-secrets with the staging environment, or point `WorkOS:ApiBaseUrl` at the WorkOS emulator (`npx @workos/emulate --interactive`, key `sk_test_default`).
- Session cookie (`comerico.auth`, `__Host-` prefixed outside Development, HttpOnly): the frontend calls the API cross-origin with credentials (`SameSite=None` outside Development).
- `AppUserClaimsPrincipalFactory` stamps `household_id`, `household_role`, and `display_name` claims into the cookie. After create/join household, the endpoint calls `RefreshSignInAsync` to re-issue the cookie with fresh claims.
- Endpoints: `GET /api/auth/login|callback`, `POST /api/auth/logout`, `GET|PUT|DELETE /api/auth/me`, `POST /api/households`, `POST /api/households/join` (invite code — still how a person joins a household after their first login).
- Cookie auth events return 401/403 JSON instead of login-page redirects.
- Data Protection keys persist in the shared database (`DataProtectionKeys` table via `PersistKeysToDbContext`), so cookies stay valid across container instances/restarts. In-memory keys caused random session loss in production.
- **Frontend session (TanStack Start pattern):** `fetchCurrentUser` (`createServerFn` in `src/server/auth.ts`) forwards the request cookie to `/api/auth/me` on the Start server; the root route's `beforeLoad` puts the user into router context, and protected routes throw `redirect({ to: '/login' })` when missing. SSR, reloads, and client navigations all share the same auth state — never store the session in client-only React state.

### Multi-Tenancy (Household Isolation)
- Global Query Filters are applied automatically to **every entity implementing `IHasHousehold`** (`Dish`, `Ingredient`, `Tag`, `MealPlan`, `ShoppingItem`, `Product`, `ProductEvent`) via `ModelBuilderExtensions.ApplyHouseholdFilters` — new tenant-scoped entities only need to implement the interface. Only hierarchy **roots** get the filter (`BaseType == null`; EF rejects filters on TPH subclasses, and the root's filter covers them).
- `ITenantService` is resolved per HTTP request via `ClaimsTenantService` — it reads the `household_id` claim from the validated auth cookie (never client-supplied headers).
- `RequiresHousehold` policy = authenticated user + `household_id` claim present.
- Note: `PendingModelChangesWarning` is suppressed in `Program.cs` — the tenant query filters capture a scoped service, which makes the runtime model never match the snapshot exactly (false positive).

### Mediator Pattern
- All business logic lives in `ComeRico.Core/Features/**` as MediatR `IRequestHandler<,>`.
- The API layer (`ComeRico.Api/Endpoints/`) maps HTTP routes → MediatR commands/queries.
- Validation is enforced by `ValidationBehavior<,>` in the MediatR pipeline before any handler executes.

### Meal Planning & Shopping (domain rules)
- `Dish` owns `Ingredient`s (name + `decimal Quantity` + `MeasurementUnit` enum — closed unit set so amounts can be summed) and has a many-to-many with `Tag` (unique per household by name).
- **Portions** (`Portions` in Core/Domain/Entities): `Dish.Servings` = people the recipe's quantities yield; `MealPlan.Servings` = people that meal is cooked for (`PATCH /api/meal-plans/{id}/servings`); both default to `Household.DefaultServings` (household settings) when omitted. The list scales each ingredient by `MealPlan.Servings / Dish.Servings`, sums per name + unit, then rounds the total once: pieces/packages up to a whole number, other units to 2 decimals.
- `MealPlan` schedules a dish on a `DateOnly` + `MealType` (Breakfast/Lunch/Dinner).
- **Shopping list = synced table** (spike 3.3). `ShoppingItem.Source` is `Manual | MealPlan | Recurring`, with optional `ProductId`; quantities are `Quantity` (`numeric(12,4)`). `POST /api/shopping-items/sync` (`SyncShoppingListCommand`, run by the `/shopping` loader and "Actualizar lista") is idempotent and never fails on an empty menu:
  - **Products:** every product that `RestockRule` puts on the list (`Due`/`OutOfStock`) gets one pending item; a pending `Recurring` item whose product no longer belongs is removed (manual items linked to a product are left alone). Product commands (create/update/out-of-stock/in-stock/snooze/delete) apply the same per-product reconcile (`ShoppingListSync.SyncProductOnListAsync`) in their own `SaveChanges`, so the list updates immediately.
  - **Menu:** ingredients of meals in the window (scaled by portions, see below) are summed by name (case-insensitive) + unit. Window = 7 days from the next shopping day (today included), or today + 6 without one. Pending menu items are updated in place (stable ids), added or removed; purchased ones are never touched and, if bought/dismissed since `windowStart - 6`, subtract from (or drop) what's needed.
  - **Removing an item** never lets the sync bring it back: menu item → `DismissedAt` (hidden, "ya tengo"); due product → "Saltar esta compra" (snooze); out-of-stock product → "Sí hay" (+ snooze if also due by time); anything else is deleted.
  - **Shopping mode (cart + checkout, spike 3.4):** `ShoppingItem.Status` is `Pending → InCart → Purchased`. `PATCH /api/shopping-items/{id}/cart` only flips `InCart` (+ `InCartAt`/`InCartByUserId`, shown as "lo tomó Ana") and **never touches the product or its log**; `PATCH /{id}/quantity` adjusts quantities (and marks them `QuantityOverridden`, so the menu sync stops recomputing that item); `POST /api/shopping-items` with `inCart: true` adds an off-list item straight into the cart. `POST /api/shopping-trips` (`CheckoutCommand`, one `SaveChanges`) creates a `ShoppingTrip` (store and total optional, total in the household currency), turns the cart into `Purchased` (they leave the list) and logs `ProductPurchased` (with `ShoppingTripId`) + `Product.ApplyPurchase` for each item with a product. `POST /api/shopping-trips/{id}/undo` only works on the latest non-reverted trip: items go back to the cart, purchases get `ProductPurchaseReverted`, and the product's last purchase and "se acabó" are restored from the history (`ProductPurchases`). The list shows pending + in-cart items; the sync never touches items in the cart and counts them (with purchases in the look-back) against what the menu needs. Frontend: cart checks are optimistic with `networkMode: 'offlineFirst'`; the list polls every 5 s while something is in the cart.
  - "Hacer recurrente" (`POST /api/shopping-items/{id}/make-recurring`) creates the product from a pending manual item (or links an active one with the same name) and turns the item into its `Recurring` item.
- Enums serialize as strings (`ConfigureHttpJsonOptions` + `JsonStringEnumConverter`) so the Hey-API client emits string literal unions.
- **EF gotcha:** entities with client-generated Guid keys discovered only through a navigation are tracked as `Modified`, not `Added` — always `Add`/`RemoveRange` child entities through their `DbSet` (see `SetDishIngredients`).

### Household Product Catalog (`Product`, `ProductEvent`)
- `Product` (name, `ProductCategory`, default quantity/unit, `RestockIntervalDays?`, last-purchase cache, `OutOfStockAt`, `SnoozedUntil`, `IsActive`) is managed via `/api/products` (any household member; `DELETE` deactivates, history is kept). Actions: `POST /{id}/out-of-stock` ("Se acabó"), `/in-stock` ("Sí hay"), `/snooze` ("Todavía tengo", rejected for out-of-stock products): `days` count from the date it would be due (today if it already is), and with `Household.ShoppingDay` the snooze always skips the trip where the product would show up, so `days: 1` is "Saltar esta compra".
- The appearance rule lives in `RestockRule` (Core/Domain/Entities): out of stock always appears; otherwise `reference >= max(LastPurchasedOn + effectiveInterval, SnoozedUntil)` where `reference` is the next shopping day (or today) and the interval scales with the quantity bought when units match. `GET /api/products` returns the computed `status` (`Ok`/`DueSoon`/`Due`/`OutOfStock`) and `nextDueOn` — nothing derived is stored.
- `ProductEvent` is an append-only TPH hierarchy (`ProductPurchased`, `ProductPurchaseReverted`, `ProductMarkedOutOfStock`, `ProductSnoozed`, `ProductIntervalChanged`; table `ProductEvents`, discriminator `Type`, per-type check constraints), written in the **same `SaveChanges`** as each `Product` state change. `Money(Amount, Currency)` is an owned type (`LineTotal_Amount/Currency`); `LineTotal` is the whole-line net price. Quantities are `Quantity`, money is always `Money`.
- **"Today" is household-local:** `Household.TimeZone` (IANA, required on `POST /api/households`, the frontend sends the browser's zone; existing rows default to `UTC`) feeds `HouseholdTime.Today(tz, TimeProvider)`, used by the product handlers/query and the future-date validation. Never use the server's UTC date for catalog rules. `Household.DefaultCurrency` defaults to `USD`. `HouseholdTime` resolves zones with `TimeZoneInfo.FindSystemTimeZoneById` (IANA ids work on Linux; the managed Lambda AL2023 runtime ships tzdata since 2024); an unknown stored zone falls back to UTC with a logged warning instead of failing the request.
- **Household settings:** `PUT /api/households/settings` (admin only, `IRequireHouseholdAdmin`) edits `shoppingDay?`, `defaultCurrency` (ISO 4217, `CurrencyCodes`) and `timeZone` (IANA). They are exposed as `householdSettings` in `GET /api/auth/me`; the UI lives on the household page (`HouseholdSettings.tsx`).
- `NextDueOn` = `max(DueOn, SnoozedUntil)`; both `Due` and `DueSoon` use it, so a snoozed product is `Ok`. Re-snoozing never shortens an existing snooze. Restock interval minimum is 2 days (validator, check constraint, and the quantity-scaled interval is clamped to it). Quantities are `numeric(12,4)`.
- A typed "last purchased" date is an **estimate**: it writes `ProductLastPurchaseDeclared` and only updates the cache (no out-of-stock/snooze reset). `ProductPurchased` is reserved for real purchases (checkout/receipt). "Sí hay" logs `ProductMarkedInStock`.
- `TimeProvider` is injected for "now" so handlers are testable.

### File Uploads (Cloudflare R2, presigned)
- **Ticket flow:** `POST /api/images` (`RequiresHousehold`, JSON `{contentType, sizeBytes}`) creates a `StoredFile` row (`Pending`) and returns `{uploadId, uploadUrl, fields}` — a presigned POST (`CreatePresignedPostAsync`, 15 min) whose signed policy enforces `Content-Type` (`ExactMatchCondition`) and the size range (`ContentLengthRangeCondition`) **at the storage layer**. The browser submits multipart/form-data with all `fields` plus the file (last) **directly to R2** (no upload traffic through the API); the bucket needs a CORS rule allowing POST for that to work.
- Create/UpdateDish receive `imageUploadId` (the `StoredFile` id, never a storage path — clients can't choose keys); the handler resolves it via `ResolveUploadAsync` (tenant-filtered, flips to `Active`, returns the public URL stored in `Dish.ImageUrl`). `UpdateDishRequest`: `imageUploadId` null keeps the current image, `removeImage: true` drops it.
- `R2FileStorage` (`ComeRico.Api/Services`, implements `IFileStorage` from Core) configures `AmazonS3Client` with `ServiceURL` from config and checksums `WHEN_REQUIRED` (required for R2), per https://developers.cloudflare.com/r2/examples/aws/aws-sdk-net/.
- Config lives in the `R2` section (`ServiceUrl` — the full `https://{accountId}.r2.cloudflarestorage.com` endpoint —, `AccessKeyId`, `SecretAccessKey`, `BucketName`, `PublicBaseUrl`); locally secrets live in dotnet user-secrets (mirroring the root `.env`), in production env vars (`R2__ServiceUrl`, …). `PublicBaseUrl` is the bucket's r2.dev subdomain or custom domain and must allow public reads.
- Object keys are `dishes/{householdId}/{guid}.{ext}`; `CreateUploadCommand`'s validator enforces content type (JPG/PNG/WebP/AVIF/GIF) and the 5 MB limit (see `UploadRules`).
- **Orphan GC (mark-and-sweep):** replacing/removing a dish image marks the old `StoredFile` `Orphaned`. `GET /api/images/cleanup` (invoked by Vercel Cron weekly — the cron hits the Vercel origin, which rewrites through to the Azure-hosted backend — authenticated with `Authorization: Bearer {CRON_SECRET}` — not a user cookie; it runs cross-tenant with `IgnoreQueryFilters`) deletes blobs+rows that are `Orphaned` or `Pending` older than 2h (tickets never consumed). External/legacy image URLs have no `StoredFile` row and are ignored.

### Frontend ↔ Backend Communication
- **REST** (`/api/*`) for CRUD operations — in dev, proxied via Nitro's `devProxy` (configured on the `nitro()` plugin in `vite.config.ts`; Vite's own `server.proxy` is NOT used because the Nitro dev server handles requests first). In production, `vercel.json` rewrites route these paths to the Azure App Service backend (see `infra/azure.md`) — server-side, so the browser only ever sees the Vercel origin and the `__Host-` auth cookie stays same-origin.
- **Two backend URLs, by design:** `frontend/src/lib/api.ts` resolves the API base isomorphically — `window.location.origin` in the browser (→ Vercel rewrite → Azure) and `process.env.BACKEND_URL` on the Start server (→ Azure directly, cookie forwarded manually). Both must point at the backend or auth breaks on one path only.

### Environments & releases (Development vs Production)
- **Development** = `main`. Every push to `main` deploys the backend to the Development Lambda (`deploy-backend.yml`), and Vercel builds `main` as a **Preview**, whose `PUBLIC_BACKEND_URL` is the Development backend. Stable URL: Vercel's branch alias for `main` (`come-rico-git-main-…vercel.app`, behind Vercel's deployment protection). Development migrations are run by hand (`migrate-database`, `environment=Development`).
- **Production** = the latest release. Vercel's Production Branch is **`production`** (not `main`), so `comerico.davbrito.dev` only changes on a release.
- **Releasing = merging release-please's PR.** `release-please.yml` keeps a `chore(main): release X.Y.Z` PR open, computing the version and `CHANGELOG.md` from Conventional Commits since the last release (`feat` → minor, `fix` → patch, `!`/`BREAKING CHANGE` → major; `chore`/`docs`/`ci`/… don't bump). Merging it tags `vX.Y.Z`, creates the GitHub release and calls `release.yml`, which, on the tagged commit: waits for CI (`backend`/`frontend` green) → **migrates the Production database** (`migrate-database.yml`) → deploys the Production backend (`deploy-backend.yml`) → moves the `production` branch (Vercel publishes it). Migrate and deploy use the `Production` GitHub Environment, so its reviewers approve them. Pushing a `v*.*.*` tag by hand runs the same `release.yml`.
- Because the release migrates before deploying, **write migrations backward-compatible** (expand/contract: add first, drop/rename in a later release) whenever the old backend could run against the new schema.
- Commit messages must follow Conventional Commits (Dependabot uses `chore(deps)`). Never push to `production` by hand except to roll back (point it at an older release's commit).

---

## 5. Known Issues & Next Steps

- **Invitations:** sent from the WorkOS dashboard; there is no in-app screen for the general admin yet, and an invitation doesn't carry the household (the person joins with the household's invite code).
- **Tests:** Backend has xUnit coverage (`backend/ComeRico.Tests`, xUnit v3 on Microsoft.Testing.Platform + EF Core InMemory, hand-rolled fakes instead of a mocking library) — run via `dotnet test --solution backend/ComeRico.slnx`. Covers the AuthKit login round trip (`AuthKitLoginTests.cs`, `WebApplicationFactory` with a fake `IWorkOsClient`), household invite codes, membership/fallback-admin logic, the household create/join flow, EF Core household query-filter isolation (`TenantIsolationTests.cs`), and `ClaimsTenantService` claim resolution. Frontend still has no Vitest coverage.
- **Database config:** the backend reads `ConnectionStrings:DefaultConnection` only, in ADO.NET `keyword=value` form (`Host=...;Port=...;Database=...;Username=...;Password=...`), set via the `ConnectionStrings__DefaultConnection` env var in production. There is **no** URI-style `DATABASE_URL` parsing in the codebase — earlier docs claimed a `ConnectionStringResolver` that has never existed. Neon's dashboard can emit the ADO.NET format directly.
- **Migrations policy:** Migrations run exclusively via the dotnet CLI (`dotnet ef database update --project ComeRico.Core --startup-project ComeRico.Api`), wrapped by `migrate-database.yml` (by hand for Development; automatically, before the backend deploy, in every Production release). The app never auto-migrates at startup, in any environment.

---

## 6. TanStack Intent — Skill Mappings

<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
<!-- intent-skills:end -->
