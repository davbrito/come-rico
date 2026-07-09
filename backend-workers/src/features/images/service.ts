import { eq } from "drizzle-orm";
import type { TenantDb } from "../../db/tenant";
import { BusinessError } from "../../http/errors";

// Image helpers used by dishes. The full upload endpoints + R2 wiring + GC
// sweep are a separate step; these are the DB/config-only pieces dishes need.

/**
 * Public URL for a stored image key. Absolute URLs (legacy dishes with
 * hand-typed links) pass through unchanged; null stays null.
 */
export function resolveImageUrl(baseUrl: string, key: string | null): string | null {
  if (!key) return null;
  if (key.startsWith("http")) return key;
  return `${baseUrl.replace(/\/+$/, "")}/${key}`;
}

/**
 * Resolve an upload-ticket id to its storage key and mark it Active. Under the
 * direct-upload flow the blob already lives at its final key, so there's no
 * staging copy. Tenant-scoped: a ticket from another household is simply not
 * found. Returns null when no id is given.
 */
export async function resolveUpload(tenant: TenantDb, uploadId: string | null | undefined): Promise<string | null> {
  if (!uploadId) return null;
  const file = await tenant.storedFiles.findFirst(eq(tenant.storedFiles.table.id, uploadId));
  if (!file) {
    throw new BusinessError("La imagen subida no existe o ya expiró. Intenta subirla de nuevo.");
  }
  await tenant.storedFiles.update({ status: "Active" }, eq(tenant.storedFiles.table.id, uploadId));
  return file.key;
}

/**
 * Mark the file at the given storage key Orphaned so the next sweep deletes it.
 * No-op for null or absolute URLs (legacy links never match a key).
 */
export async function orphanByKey(tenant: TenantDb, key: string | null): Promise<void> {
  if (!key || key.startsWith("http")) return;
  await tenant.storedFiles.update({ status: "Orphaned" }, eq(tenant.storedFiles.table.key, key));
}
