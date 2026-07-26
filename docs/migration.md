# Migrating data onto the Terraform stack

The Terraform stack in `infra/` provisions a **new** Neon project and a **new** R2 bucket. If
you're cutting over from the previous Vercel/Neon/R2 setup, the data has to
come with you.

Rehearse this against a throwaway stack (`terraform apply -var stage=dev-x`
in `infra/`, which names every resource with that stage) before doing it for
real.

## 1. Database

```bash
# Old project
pg_dump "postgresql://<old-connection-string>" \
  --no-owner --no-privileges -Fc -f comerico.dump

# New project (connection details from the Neon console, or `terraform output` in infra/)
pg_restore --no-owner --no-privileges \
  -d "postgresql://<new-connection-string>" comerico.dump
```

**Check `DataProtectionKeys` came across.** ASP.NET Core Data Protection
keys live in that table (`PersistKeysToDbContext`), so carrying them over
keeps existing auth cookies valid. Losing them logs every user out — not
fatal, but know which you're choosing:

```sql
SELECT count(*) FROM "DataProtectionKeys";
```

## 2. Image objects

Copy the R2 objects across. `StoredFile.Key` values stay valid — only the
bucket changes.

```bash
# e.g. with rclone remotes configured for both buckets
rclone copy old-r2:comerico-images new-r2:comerico-images --progress
```

## 3. Rewrite `Dish.ImageUrl` ← don't skip this

`Dish.ImageUrl` stores **absolute public URLs**, built from
`R2__PublicBaseUrl` at upload time (`R2FileStorage.GetPublicUrl`, used by
the create/update dish handlers). A new bucket means a new public base URL,
so every row still points at the old bucket.

Skipping this leaves the app looking healthy while every dish image 404s.

```sql
-- Dry run first: how many rows, and what will they become?
SELECT count(*) FROM "Dishes" WHERE "ImageUrl" LIKE '<old-base-url>%';

UPDATE "Dishes"
SET "ImageUrl" = replace("ImageUrl", '<old-base-url>', '<new-base-url>')
WHERE "ImageUrl" LIKE '<old-base-url>%';
```

> You can avoid this step entirely by pointing the **same custom domain** at
> the new bucket, so the public base URL never changes. Worth checking
> before you migrate.

## 4. Verify

- Log in — exercises Data Protection keys and the `/api/**` proxy.
- Hard-reload a protected page and confirm the logged-in state appears on
  **first paint**. That exercises the SSR path (`BACKEND_URL` read
  server-side in `frontend/src/lib/api.ts`), which is separate from the
  browser's proxy path and the most likely thing to be misconfigured.
- Open a dish with an image — confirms step 3.
- Upload a new image — exercises the presigned POST and the R2 CORS rule.
- Trigger the cleanup cron and confirm it returns 200 with the bearer
  secret.
