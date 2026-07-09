import { createRoute } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import type { AppEnv, SessionUser } from "../context";
import type { Db } from "../db/client";
import { households, user as userTable } from "../db/schema";
import { createApp, emptyResponse, errors, jsonResponse } from "../openapi/factory";
import {
  CurrentUserDto,
  InfoResponse,
  LoginRequest,
  LoginResponse,
  ManageInfoRequest,
  RegisterRequest,
  UpdateProfileRequest,
  type CurrentUser,
} from "../openapi/schemas";
import { promoteFallbackAdminIfNeeded } from "./membership";
import { requireAuth } from "./session";

async function buildCurrentUser(db: Db, user: SessionUser): Promise<CurrentUser> {
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

const validationBody = (field: string, message: string) => ({ errors: [{ field, message }] });

// Copy Better Auth's Set-Cookie headers onto the Hono response.
function passCookies(c: Context<AppEnv>, res: Response) {
  for (const cookie of res.headers.getSetCookie()) c.header("set-cookie", cookie, { append: true });
}

export const authRoutes = createApp();

// POST /api/identity/login — no operationId, so the generated client keeps the
// name `postApiIdentityLogin` (matching the frontend).
authRoutes.openapi(
  createRoute({
    method: "post",
    path: "/api/identity/login",
    tags: ["Auth"],
    summary: "Inicia sesión (cookie de sesión)",
    request: { body: { content: { "application/json": { schema: LoginRequest } }, required: true } },
    responses: {
      200: jsonResponse(LoginResponse, "Sesión iniciada"),
      401: errors.unauthorized,
      422: errors.validation,
    },
  }),
  async (c) => {
    const { email, password } = c.req.valid("json");
    const res = await c.get("auth").api.signInEmail({ body: { email, password }, headers: c.req.raw.headers, asResponse: true });
    passCookies(c, res);
    if (!res.ok) return c.json({ message: "Credenciales inválidas." }, 401);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return c.json(data, 200);
  },
);

authRoutes.openapi(
  createRoute({
    method: "post",
    path: "/api/auth/register",
    tags: ["Auth"],
    operationId: "Register",
    summary: "Registra un nuevo usuario e inicia sesión",
    request: { body: { content: { "application/json": { schema: RegisterRequest } }, required: true } },
    responses: { 200: jsonResponse(CurrentUserDto, "Usuario registrado"), 422: errors.validation },
  }),
  async (c) => {
    const { displayName, email, password } = c.req.valid("json");
    const name = displayName.trim();
    const baRes = await c.get("auth").api.signUpEmail({ body: { email, password, name }, asResponse: true });
    if (!baRes.ok) {
      const err = (await baRes.json().catch(() => null)) as { message?: string } | null;
      return c.json(validationBody("email", err?.message ?? "No se pudo completar el registro."), 422);
    }
    const data = (await baRes.json()) as { user: { id: string; email: string; name: string } };
    passCookies(c, baRes);
    return c.json(
      {
        id: data.user.id,
        displayName: data.user.name,
        email: data.user.email,
        householdId: null,
        householdName: null,
        inviteCode: null,
        role: "Member" as const,
      },
      200,
    );
  },
);

authRoutes.openapi(
  createRoute({
    method: "post",
    path: "/api/auth/logout",
    tags: ["Auth"],
    operationId: "Logout",
    summary: "Cierra la sesión actual",
    middleware: [requireAuth] as const,
    responses: { 200: emptyResponse("Sesión cerrada"), 401: errors.unauthorized },
  }),
  async (c) => {
    const res = await c.get("auth").api.signOut({ headers: c.req.raw.headers, asResponse: true });
    passCookies(c, res);
    return c.body(null, 200);
  },
);

authRoutes.openapi(
  createRoute({
    method: "get",
    path: "/api/auth/me",
    tags: ["Auth"],
    operationId: "GetCurrentUser",
    summary: "Obtiene el usuario autenticado y su hogar",
    middleware: [requireAuth] as const,
    responses: { 200: jsonResponse(CurrentUserDto, "Usuario actual"), 401: errors.unauthorized },
  }),
  async (c) => c.json(await buildCurrentUser(c.get("db"), c.get("user")!), 200),
);

authRoutes.openapi(
  createRoute({
    method: "put",
    path: "/api/auth/me",
    tags: ["Auth"],
    operationId: "UpdateProfile",
    summary: "Actualiza el nombre para mostrar del usuario autenticado",
    middleware: [requireAuth] as const,
    request: { body: { content: { "application/json": { schema: UpdateProfileRequest } }, required: true } },
    responses: {
      200: jsonResponse(CurrentUserDto, "Perfil actualizado"),
      422: errors.validation,
      401: errors.unauthorized,
    },
  }),
  async (c) => {
    const user = c.get("user")!;
    const displayName = c.req.valid("json").displayName.trim();
    const db = c.get("db");
    await db.update(userTable).set({ name: displayName, updatedAt: new Date() }).where(eq(userTable.id, user.id));
    return c.json(await buildCurrentUser(db, { ...user, name: displayName }), 200);
  },
);

authRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/api/auth/me",
    tags: ["Auth"],
    operationId: "DeleteAccount",
    summary: "Elimina la cuenta del usuario autenticado",
    middleware: [requireAuth] as const,
    responses: { 200: emptyResponse("Cuenta eliminada"), 401: errors.unauthorized },
  }),
  async (c) => {
    const user = c.get("user")!;
    const db = c.get("db");
    await promoteFallbackAdminIfNeeded(db, user);
    await db.delete(userTable).where(eq(userTable.id, user.id));
    const res = await c.get("auth").api.signOut({ headers: c.req.raw.headers, asResponse: true });
    passCookies(c, res);
    return c.body(null, 200);
  },
);

// POST /api/identity/manage/info — no operationId → client keeps
// `postApiIdentityManageInfo`. The settings page posts { oldPassword,
// newPassword } here to change the password.
authRoutes.openapi(
  createRoute({
    method: "post",
    path: "/api/identity/manage/info",
    tags: ["Auth"],
    summary: "Actualiza la cuenta (cambio de contraseña)",
    middleware: [requireAuth] as const,
    request: { body: { content: { "application/json": { schema: ManageInfoRequest } }, required: true } },
    responses: {
      200: jsonResponse(InfoResponse, "Información de la cuenta"),
      400: errors.badRequest,
      422: errors.validation,
      401: errors.unauthorized,
    },
  }),
  async (c) => {
    const user = c.get("user")!;
    const { oldPassword = "", newPassword = "" } = c.req.valid("json");
    const infoResponse = { email: user.email, isEmailConfirmed: true };
    if (!newPassword && !oldPassword) return c.json(infoResponse, 200);
    if (newPassword.length < 8) {
      return c.json(validationBody("newPassword", "La contraseña debe tener al menos 8 caracteres."), 422);
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
    passCookies(c, baRes);
    return c.json(infoResponse, 200);
  },
);
