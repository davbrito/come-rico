import { and, eq, lt, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { storedFiles } from "../db/schema";

const PENDING_GRACE_MS = 2 * 60 * 60 * 1000; // 2 hours

// Mark-and-sweep GC, run cross-tenant from the Worker's scheduled() handler
// (replaces the Vercel Cron + CRON_SECRET endpoint). Deletes blobs + rows that
// are Orphaned, or Pending past the grace period (tickets never consumed).
// Cross-tenant by design, so it uses the raw client — outside features/**.
export async function sweepOrphanedFiles(db: Db, bucket: R2Bucket, now: Date = new Date()): Promise<number> {
  const pendingCutoff = new Date(now.getTime() - PENDING_GRACE_MS);

  const orphans = await db
    .select({ id: storedFiles.id, key: storedFiles.key })
    .from(storedFiles)
    .where(
      or(
        eq(storedFiles.status, "Orphaned"),
        and(eq(storedFiles.status, "Pending"), lt(storedFiles.createdAt, pendingCutoff)),
      ),
    );

  for (const file of orphans) {
    // R2 delete is idempotent and won't throw on a missing key.
    await bucket.delete(file.key);
    await db.delete(storedFiles).where(eq(storedFiles.id, file.id));
  }

  return orphans.length;
}
