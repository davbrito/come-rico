import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { promoteFallbackAdminIfNeeded } from "../auth/membership";
import { householdId, requireAdmin, requireAuth, requireHousehold } from "../auth/session";
import type { AppEnv } from "../context";
import { uuidv7 } from "../db/uuid";
import { households, user as userTable } from "../db/schema";
import { BusinessError, NotFoundError } from "../http/errors";
import { validateJson } from "../http/validate";

interface HouseholdDto {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: Date;
}

interface HouseholdMemberDto {
  id: string;
  displayName: string;
  role: string;
  createdAt: Date;
}

// Matches Household.GenerateInviteCode: 8 uppercase hex chars.
function generateInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre del hogar es obligatorio.")
    .max(200, "El nombre no puede superar los 200 caracteres."),
});

const joinSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(1, "El código de invitación es obligatorio.")
    .max(20, "El código de invitación no es válido."),
});

export const householdRoutes = new Hono<AppEnv>();

// Create a household and make the caller its admin. Not RequiresHousehold —
// the user must NOT already belong to one.
householdRoutes.post("/api/households", requireAuth, validateJson(nameSchema), async (c) => {
  const user = c.get("user")!;
  const db = c.get("db");
  if (user.householdId) {
    throw new BusinessError("Ya perteneces a un hogar. Sal de él antes de crear uno nuevo.");
  }

  const { name } = c.req.valid("json");
  const [household] = await db
    .insert(households)
    .values({ id: uuidv7(), name, inviteCode: generateInviteCode(), createdAt: new Date() })
    .returning();

  await db.update(userTable).set({ householdId: household!.id, role: "Admin" }).where(eq(userTable.id, user.id));

  const dto: HouseholdDto = household!;
  return c.json(dto, 201);
});

// Join an existing household by invite code, as a member.
householdRoutes.post("/api/households/join", requireAuth, validateJson(joinSchema), async (c) => {
  const user = c.get("user")!;
  const db = c.get("db");
  if (user.householdId) {
    throw new BusinessError("Ya perteneces a un hogar. Sal de él antes de unirte a otro.");
  }

  const code = c.req.valid("json").inviteCode.trim().toUpperCase();
  const [household] = await db.select().from(households).where(eq(households.inviteCode, code)).limit(1);
  if (!household) {
    throw new BusinessError("No existe un hogar con ese código de invitación.");
  }

  await db.update(userTable).set({ householdId: household.id, role: "Member" }).where(eq(userTable.id, user.id));

  const dto: HouseholdDto = household;
  return c.json(dto, 200);
});

// Rename the household (admin only). Note: the .NET endpoint returned 401 for
// non-admins, which in an SPA can trigger a logout redirect; requireAdmin
// returns the correct 403.
householdRoutes.patch("/api/households/name", requireHousehold, requireAdmin, validateJson(nameSchema), async (c) => {
  const db = c.get("db");
  const { name } = c.req.valid("json");
  const updated = await db
    .update(households)
    .set({ name })
    .where(eq(households.id, householdId(c)))
    .returning();
  if (updated.length === 0) throw new NotFoundError("Hogar no encontrado.");
  return c.body(null, 200);
});

// Rotate the invite code (admin only).
householdRoutes.post("/api/households/invite-code/rotate", requireHousehold, requireAdmin, async (c) => {
  const db = c.get("db");
  const [household] = await db
    .update(households)
    .set({ inviteCode: generateInviteCode() })
    .where(eq(households.id, householdId(c)))
    .returning();
  if (!household) throw new NotFoundError("Hogar no encontrado.");
  const dto: HouseholdDto = household;
  return c.json(dto, 200);
});

// Leave the current household, promoting a fallback admin first if needed.
householdRoutes.post("/api/households/leave", requireHousehold, async (c) => {
  const user = c.get("user")!;
  const db = c.get("db");
  await promoteFallbackAdminIfNeeded(db, user);
  await db.update(userTable).set({ householdId: null, role: "Member" }).where(eq(userTable.id, user.id));
  return c.body(null, 200);
});

// List household members, oldest first.
householdRoutes.get("/api/households/members", requireHousehold, async (c) => {
  const db = c.get("db");
  const members = await db
    .select({
      id: userTable.id,
      displayName: userTable.name,
      role: userTable.role,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .where(eq(userTable.householdId, householdId(c)))
    .orderBy(asc(userTable.createdAt));
  const dto: HouseholdMemberDto[] = members;
  return c.json(dto);
});
