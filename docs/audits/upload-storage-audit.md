# Upload & Storage Audit — Cloudflare R2 image uploads

**Date:** 2026-07-10
**Scope:** `R2FileStorage.cs`, `CreateUpload.cs`, `CleanupOrphanedFiles.cs`,
`StoredFileExtensions.cs`, `StoredFile.cs`, `ImageEndpoints.cs`,
`CreateDish.cs` / `UpdateDish.cs` / `DeleteDish.cs`, `DishForm.tsx`.

---

## 1. Overall Impression

The architecture is genuinely well designed for its size: upload tickets with
tenant-scoped `Pending` rows, presigned PUT URLs that pin `Content-Type` and
`Content-Length` at the signature level, entities referencing uploads by id
instead of raw paths, and a mark-and-sweep GC for orphans. However, the
correlation step (`ResolveUploadAsync`) has a replay bug that can **destroy a
live image blob**, and the staging→permanent move is not crash-safe, so
untracked blobs can leak in R2.

## 2. Critical Issues

### C1 — Replaying a consumed `uploadId` deletes a live blob (data loss)

`StoredFileExtensions.ResolveUploadAsync` never checks
`Status == StoredFileStatus.Pending`. If a client sends an `uploadId` that was
already consumed (the classic case: a `CreateDish` request times out client-side
after succeeding server-side, and the client retries with the same ticket):

- `file.Key` is now the *permanent* key (`dishes/...`), so
  `file.Key.StartsWith("staging/")` is false and `permanentKey == file.Key`;
- `CopyAsync(key, key)` — a self-copy; if the storage backend accepts it,
- `DeleteAsync(key)` then **deletes the only copy of an image that an existing
  dish actively references**. If the self-copy is rejected instead, the user
  gets an unhandled 500.

The same hole allows two dishes to consume one ticket concurrently and end up
sharing a key — later, orphaning one dish's image silently breaks the other's.

**Fix:** filter on `f.Status == StoredFileStatus.Pending` and translate "not
found" into the existing user-facing error.

### C2 — Staging→permanent move is not atomic with the DB save (orphaned blob leak)

In `ResolveUploadAsync` the order is: copy → **delete staging** → activate
(in-memory) → caller's `SaveChangesAsync`. If `SaveChangesAsync` fails, the
request is cancelled, or the process dies after the copy:

- The blob now lives at the permanent key, **untracked** (the DB row still says
  `Pending` + staging key).
- The sweep later deletes the *row* (the staging delete is a no-op) and the
  permanent blob leaks in R2 forever — exactly the orphan class the system was
  built to prevent, but invisible to it.

**Fix:** reorder to *copy → activate → save → best-effort delete of staging*.
A leftover staging blob is harmless: it is covered by the R2 lifecycle rule on
`staging/` and costs nothing correctness-wise. That makes the only
non-recoverable state impossible. (Callers must save before the staging delete;
alternatively move the staging delete into the sweep entirely by keeping the
old key on the row.)

### C3 — Deleting a dish never orphans its image

`DeleteDishCommandHandler` calls `dish.Deactivate()` but never
`StoredFiles.OrphanByKeyAsync(dish.ImageKey, ...)`. Every deleted dish leaks
its image as an `Active` `StoredFile` + blob that no sweep will ever collect.
If soft-deleted dishes are restorable this is deliberate — but then a
hard-delete/retention path must orphan the file, and today none exists.

### C4 — Cleanup sweep: non-constant-time secret check on a GET with side effects

`ImageEndpoints.cs`: `request.Headers.Authorization != $"Bearer {secret}"` is a
variable-time string comparison (theoretical timing-oracle on `CRON_SECRET`),
and the endpoint mutates state (deletes blobs + rows) on **GET**, which caches,
prefetchers, and link scanners may hit. Use
`CryptographicOperations.FixedTimeEquals` and `MapPost` (Vercel Cron supports
configuring the method; if it must stay GET, keep GET but fix the comparison).

## 3. Suggestions for Improvement

- **S1 — Batch the sweep.** `CleanupOrphanedFilesCommandHandler` issues one
  `DeleteObject` + one `SaveChangesAsync` **per file** (N+1 on both R2 and the
  DB). Use `DeleteObjectsAsync` (up to 1000 keys/request) and one
  `SaveChangesAsync` per batch. Also cap the query (`Take(500)`) so a huge
  backlog can't blow memory/execution time on a serverless cron.
- **S2 — The try/catch asymmetry in the sweep is dead weight.** S3-compatible
  `DeleteObject` returns success for nonexistent keys, so the "lifecycle policy
  already deleted it" catch never fires for that reason; meanwhile a transient
  R2 error on an `Orphaned` file aborts the whole sweep. Treat both statuses
  the same and continue past per-key failures.
- **S3 — Verify the blob exists before activating** (optional, UX):
  a `HeadObject` (or catching `NoSuchKey` from the copy) turns "user sent a
  ticket but never uploaded" into a clean 400 instead of a 500.
- **S4 — Quota/rate-limit `CreateUpload`.** Any household member can mint
  unlimited tickets and PUT 5 MB per ticket for the 2-hour grace window.
  A cheap per-household cap on concurrent `Pending` rows closes it.
- **S5 — `ResolveImageUrl`'s `StartsWith("http")` is brittle** (matches any
  key that happens to start with "http"). Prefer
  `Uri.IsWellFormedUriString(key, UriKind.Absolute)`.
- **S6 — Document the coupling between `PendingGracePeriod` (2 h) and the R2
  lifecycle rule on `staging/`.** If someone shortens the lifecycle rule below
  ~2 h, an in-flight upload can be deleted before the dish is created; there is
  no config-level guard, only the comment.
- **S7 — Content is never validated as an actual image** (only the declared
  `Content-Type` is pinned). Risk is contained because blobs are served from a
  separate origin (`r2.dev`/storage subdomain) with non-executable image types,
  so this is acceptable — but worth a note if the allowlist ever grows (SVG
  would be an XSS vector).
- **S8 — Frontend (`DishForm.tsx`) is correct** in ticket→PUT→create ordering
  and abandons tickets safely (the sweep collects them). Minor: a retry of the
  whole submit reuses nothing — it correctly mints a fresh ticket.

## 4. Implementation proposal

### `StoredFileExtensions.ResolveUploadAsync` (fixes C1 + C2)

```csharp
public static async Task<string?> ResolveUploadAsync(
    this IAppDbContext dbContext,
    IFileStorage storage,
    Guid? uploadId,
    CancellationToken ct
)
{
    if (uploadId is null)
        return null;

    // Only Pending tickets are consumable: a replayed/consumed id must not
    // re-resolve, or the copy+delete below would destroy the live blob (C1).
    var file =
        await dbContext.StoredFiles.FirstOrDefaultAsync(
            f => f.Id == uploadId && f.Status == StoredFileStatus.Pending, ct)
        ?? throw new InvalidOperationException(
            "La imagen subida no existe o ya expiró. Intenta subirla de nuevo.");

    var stagingKey = file.Key;
    var permanentKey = stagingKey["staging/".Length..];

    await storage.CopyAsync(stagingKey, permanentKey, ct);
    file.Activate(permanentKey);

    // Persist the activation BEFORE deleting the staging blob (C2): if this
    // save fails, the permanent copy is re-derivable from the still-Pending
    // row, and the staging blob is still covered by the lifecycle rule.
    await dbContext.SaveChangesAsync(ct);

    // Best-effort: a leftover staging blob is reclaimed by the R2 lifecycle
    // rule; never fail the business operation over it.
    try
    {
        await storage.DeleteAsync(stagingKey, CancellationToken.None);
    }
    catch { /* swept by lifecycle rule */ }

    return permanentKey;
}
```

Note: this changes the contract — the extension now owns a `SaveChangesAsync`
for the activation. `CreateDish`/`UpdateDish` keep their own final save (two
saves per request, or wrap both in an explicit transaction if the provider
supports it; the important invariant is *activate persisted before staging
delete*).

### `DeleteDishCommandHandler` (fixes C3)

```csharp
var dish = await dbContext.Dishes.FirstOrDefaultAsync(d => d.Id == request.DishId, cancellationToken);
if (dish is null)
    return false;
dish.Deactivate();
await dbContext.StoredFiles.OrphanByKeyAsync(dish.ImageKey, cancellationToken);
await dbContext.SaveChangesAsync(cancellationToken);
```

(Only if soft-deleted dishes are not restorable with their image; otherwise do
this in the eventual hard-delete path.)

### `ImageEndpoints` cleanup auth (fixes C4)

```csharp
static bool IsAuthorized(HttpRequest request, string? secret)
{
    if (string.IsNullOrEmpty(secret))
        return false;
    var expected = Encoding.UTF8.GetBytes($"Bearer {secret}");
    var actual = Encoding.UTF8.GetBytes(request.Headers.Authorization.ToString());
    return CryptographicOperations.FixedTimeEquals(expected, actual);
}
```

…and register the route with `MapPost` (update the Vercel Cron config
accordingly).

### `CleanupOrphanedFilesCommandHandler` (S1/S2)

```csharp
var orphans = await dbContext
    .StoredFiles.IgnoreQueryFilters()
    .Where(f => f.Status == StoredFileStatus.Orphaned
        || (f.Status == StoredFileStatus.Pending && f.CreatedAt < pendingCutoff))
    .OrderBy(f => f.CreatedAt)
    .Take(500)
    .ToListAsync(cancellationToken);

foreach (var chunk in orphans.Chunk(1000))
{
    await storage.DeleteManyAsync(chunk.Select(f => f.Key), cancellationToken); // DeleteObjectsAsync
    dbContext.StoredFiles.RemoveRange(chunk);
    await dbContext.SaveChangesAsync(cancellationToken);
}
```

with a new `IFileStorage.DeleteManyAsync` implemented via
`AmazonS3Client.DeleteObjectsAsync` in `R2FileStorage`.

**Affected files:**
`backend/ComeRico.Core/Features/Images/StoredFileExtensions.cs` (C1, C2, S5),
`backend/ComeRico.Core/Features/Dishes/Commands/DeleteDish.cs` (C3),
`backend/ComeRico.Api/Endpoints/ImageEndpoints.cs` (C4),
`backend/ComeRico.Core/Features/Images/Commands/CleanupOrphanedFiles.cs` +
`backend/ComeRico.Core/Interfaces/IFileStorage.cs` +
`backend/ComeRico.Infrastructure/Services/R2FileStorage.cs` (S1–S3).
