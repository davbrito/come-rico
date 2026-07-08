import { createMiddleware } from "hono/factory";
import { createDb } from "../db/client";
import type { AppEnv, SessionUser } from "../context";
import type { HouseholdRoleValue } from "../db/schema";
import { createAuth } from "./auth";

// Resolves the request-scoped DB + auth instances and the current session, and
// stashes them on the Hono context. Runs for every request; downstream guards
// (`requireAuth`, `requireHousehold`) enforce access.
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const db = createDb(c.env.HYPERDRIVE);
  const auth = createAuth(db, c.env);
  c.set("db", db);
  c.set("auth", auth);

  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (result?.user) {
    const u = result.user as typeof result.user & { householdId: string | null; role: HouseholdRoleValue };
    const sessionUser: SessionUser = {
      id: u.id,
      email: u.email,
      name: u.name,
      householdId: u.householdId ?? null,
      role: u.role ?? "Member",
    };
    c.set("user", sessionUser);
  } else {
    c.set("user", null);
  }

  await next();
});

// 401 when there is no authenticated user. Mirrors the cookie auth events that
// returned status codes (not login redirects) in the .NET backend.
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) return c.json({ message: "No autenticado." }, 401);
  await next();
});

// 403 unless the user belongs to a household — the `RequiresHousehold` policy.
export const requireHousehold = createMiddleware<AppEnv & { Variables: { user: SessionUser } }>(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "No autenticado." }, 401);
  if (!user.householdId) return c.json({ message: "No perteneces a ningún hogar." }, 403);
  await next();
});

// 403 unless the user is a household admin — the AdminOnlyBehavior equivalent.
// Chain after `requireHousehold` on admin-only routes.
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "No autenticado." }, 401);
  if (user.role !== "Admin") {
    return c.json({ message: "Solo los administradores pueden realizar esta acción." }, 403);
  }
  await next();
});

/** The current household id, guaranteed present after `requireHousehold`. */
export function householdId(c: { get: (k: "user") => SessionUser | null }): string {
  const user = c.get("user");
  if (!user?.householdId) throw new Error("householdId called without requireHousehold");
  return user.householdId;
}
