import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { user } from "../db/schema";

// Household membership operations that span users (cross-cutting, not
// tenant-scoped), so they live outside features/** and use the raw client.

/**
 * When an admin leaves or deletes their account, promote the longest-standing
 * remaining member to admin — but only if the household would otherwise be left
 * with no admin. Mirrors the .NET HouseholdMembershipService ordering: existing
 * admins first, then oldest by createdAt.
 *
 * Runs in the same transaction as the caller's mutation (pass `tx`).
 */
export async function promoteFallbackAdminIfNeeded(
  tx: Db,
  leaving: { id: string; householdId: string | null; role: string },
): Promise<void> {
  if (leaving.role !== "Admin" || !leaving.householdId) return;

  const [candidate] = await tx
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(and(eq(user.householdId, leaving.householdId), ne(user.id, leaving.id)))
    .orderBy(
      // Admins sort to the front, then oldest member wins.
      asc(sql`case when ${user.role} = 'Admin' then 0 else 1 end`),
      asc(user.createdAt),
    )
    .limit(1);

  if (!candidate || candidate.role === "Admin") return;

  await tx.update(user).set({ role: "Admin" }).where(eq(user.id, candidate.id));
}
