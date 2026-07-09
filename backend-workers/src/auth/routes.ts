import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, SessionUser } from "../context";
import type { Db } from "../db/client";
import { households, user as userTable } from "../db/schema";
import { promoteFallbackAdminIfNeeded } from "./membership";
import { requireAuth } from "./session";

// Shape the frontend's generated client already expects (camelCase JSON).
interface CurrentUserDto {
  id: string;
  displayName: string;
  email: string;
  householdId: string | null;
  householdName: string | null;
  inviteCode: string | null;
  role: SessionUser["role"];
}

async function buildCurrentUser(db: Db, user: SessionUser): Promise<CurrentUserDto> {
  let householdName: string | null = null;
  let inviteCode: string | null = null;
  if (user.householdId) {
    const [h] = await db
      .select({ name: households.name, inviteCode: households.inviteCode })
      .from(households)
      .where(eq(households.id, user.householdId))
      .limit(1);
    householdName = h?.name ?? null;
    inviteCode = h?.inviteCode ?? null;
  }
  return {
    id: user.id,
    displayName: user.name,
    email: user.email,
    householdId: user.householdId,
    householdName,
    inviteCode,
    role: user.role,
  };
}

function validationError(field: string, message: string) {
  return { errors: [{ field, message }] };
}

export const authRoutes = new Hono<AppEnv>();

// Identity-compatible login: POST /api/identity/login?useCookies=true.
// Better Auth issues the session cookie; the frontend only checks the status.
authRoutes.post("/api/identity/login", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  return auth.api.signInEmail({
    body: { email: String(body.email ?? ""), password: String(body.password ?? "") },
    headers: c.req.raw.headers,
    asResponse: true,
  });
});

// Custom register: accepts displayName (Better Auth's sign-up doesn't), signs
// the user in, and returns the CurrentUserDto (no household yet).
authRoutes.post("/api/auth/register", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const displayName = String(body.displayName ?? "").trim();
  if (!displayName) return c.json(validationError("displayName", "El nombre es obligatorio."), 422);

  const baRes = await auth.api.signUpEmail({
    body: { email: String(body.email ?? ""), password: String(body.password ?? ""), name: displayName },
    asResponse: true,
  });

  if (!baRes.ok) {
    const err = (await baRes.json().catch(() => null)) as { message?: string } | null;
    return c.json(validationError("email", err?.message ?? "No se pudo completar el registro."), 422);
  }

  const data = (await baRes.json()) as { user: { id: string; email: string; name: string } };
  const dto: CurrentUserDto = {
    id: data.user.id,
    displayName: data.user.name,
    email: data.user.email,
    householdId: null,
    householdName: null,
    inviteCode: null,
    role: "Member",
  };
  const out = c.json(dto, 200);
  for (const cookie of baRes.headers.getSetCookie()) out.headers.append("set-cookie", cookie);
  return out;
});

authRoutes.post("/api/auth/logout", requireAuth, (c) =>
  c.get("auth").api.signOut({ headers: c.req.raw.headers, asResponse: true }),
);

authRoutes.get("/api/auth/me", requireAuth, async (c) => {
  const user = c.get("user")!;
  return c.json(await buildCurrentUser(c.get("db"), user));
});

authRoutes.put("/api/auth/me", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const displayName = String(body.displayName ?? "").trim();
  if (!displayName) return c.json(validationError("displayName", "El nombre es obligatorio."), 422);

  const db = c.get("db");
  await db.update(userTable).set({ name: displayName, updatedAt: new Date() }).where(eq(userTable.id, user.id));
  return c.json(await buildCurrentUser(db, { ...user, name: displayName }));
});

// Identity-compatible profile/password endpoint (the frontend's settings page
// posts { oldPassword, newPassword } here to change the password). Maps to
// Better Auth's changePassword; returns the InfoResponse shape.
authRoutes.post("/api/identity/manage/info", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const oldPassword = String(body.oldPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  const infoResponse = { email: user.email, isEmailConfirmed: true };

  if (!newPassword && !oldPassword) return c.json(infoResponse);

  if (newPassword.length < 8) {
    return c.json(validationError("newPassword", "La contraseña debe tener al menos 8 caracteres."), 422);
  }

  const baRes = await c.get("auth").api.changePassword({
    body: { currentPassword: oldPassword, newPassword },
    headers: c.req.raw.headers,
    asResponse: true,
  });
  if (!baRes.ok) {
    const err = (await baRes.json().catch(() => null)) as { message?: string } | null;
    return c.json({ message: err?.message ?? "No se pudo cambiar la contraseña." }, 400);
  }

  const out = c.json(infoResponse);
  for (const cookie of baRes.headers.getSetCookie()) out.headers.append("set-cookie", cookie);
  return out;
});

authRoutes.delete("/api/auth/me", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = c.get("db");
  // Promote a fallback admin before removing the account so the household is
  // never left without one, then delete (sessions/accounts cascade via FK).
  await promoteFallbackAdminIfNeeded(db, user);
  await db.delete(userTable).where(eq(userTable.id, user.id));
  return c.get("auth").api.signOut({ headers: c.req.raw.headers, asResponse: true });
});
