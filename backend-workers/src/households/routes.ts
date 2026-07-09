import { createRoute } from "@hono/zod-openapi";
import { asc, eq } from "drizzle-orm";
import { promoteFallbackAdminIfNeeded } from "../auth/membership";
import { householdId, requireAdmin, requireAuth, requireHousehold } from "../auth/session";
import { households, user as userTable } from "../db/schema";
import { uuidv7 } from "../db/uuid";
import { BusinessError, NotFoundError } from "../http/errors";
import { createApp, emptyResponse, errors, jsonResponse } from "../openapi/factory";
import {
  CreateHouseholdRequest,
  HouseholdDto,
  HouseholdMemberList,
  JoinHouseholdRequest,
  RenameHouseholdRequest,
  type Household,
  type HouseholdMember,
} from "../openapi/schemas";

function generateInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

const toHouseholdDto = (h: { id: string; name: string; inviteCode: string; createdAt: Date }): Household => ({
  id: h.id,
  name: h.name,
  inviteCode: h.inviteCode,
  createdAt: h.createdAt.toISOString(),
});

export const householdRoutes = createApp();

householdRoutes.openapi(
  createRoute({
    method: "post",
    path: "/api/households",
    tags: ["Households"],
    operationId: "CreateHousehold",
    summary: "Crea un nuevo hogar y asigna al usuario como administrador",
    middleware: [requireAuth] as const,
    request: { body: { content: { "application/json": { schema: CreateHouseholdRequest } }, required: true } },
    responses: {
      201: jsonResponse(HouseholdDto, "Hogar creado"),
      400: errors.badRequest,
      422: errors.validation,
      401: errors.unauthorized,
    },
  }),
  async (c) => {
    const user = c.get("user")!;
    const db = c.get("db");
    if (user.householdId) throw new BusinessError("Ya perteneces a un hogar. Sal de él antes de crear uno nuevo.");
    const [household] = await db
      .insert(households)
      .values({ id: uuidv7(), name: c.req.valid("json").name, inviteCode: generateInviteCode(), createdAt: new Date() })
      .returning();
    await db.update(userTable).set({ householdId: household!.id, role: "Admin" }).where(eq(userTable.id, user.id));
    return c.json(toHouseholdDto(household!), 201);
  },
);

householdRoutes.openapi(
  createRoute({
    method: "post",
    path: "/api/households/join",
    tags: ["Households"],
    operationId: "JoinHousehold",
    summary: "Une al usuario a un hogar mediante código de invitación",
    middleware: [requireAuth] as const,
    request: { body: { content: { "application/json": { schema: JoinHouseholdRequest } }, required: true } },
    responses: {
      200: jsonResponse(HouseholdDto, "Unido al hogar"),
      400: errors.badRequest,
      422: errors.validation,
      401: errors.unauthorized,
    },
  }),
  async (c) => {
    const user = c.get("user")!;
    const db = c.get("db");
    if (user.householdId) throw new BusinessError("Ya perteneces a un hogar. Sal de él antes de unirte a otro.");
    const code = c.req.valid("json").inviteCode.trim().toUpperCase();
    const [household] = await db.select().from(households).where(eq(households.inviteCode, code)).limit(1);
    if (!household) throw new BusinessError("No existe un hogar con ese código de invitación.");
    await db.update(userTable).set({ householdId: household.id, role: "Member" }).where(eq(userTable.id, user.id));
    return c.json(toHouseholdDto(household), 200);
  },
);

householdRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/api/households/name",
    tags: ["Households"],
    operationId: "RenameHousehold",
    summary: "Cambia el nombre del hogar (solo admin)",
    middleware: [requireHousehold, requireAdmin] as const,
    request: { body: { content: { "application/json": { schema: RenameHouseholdRequest } }, required: true } },
    responses: {
      200: emptyResponse("Renombrado"),
      404: errors.notFound,
      422: errors.validation,
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const db = c.get("db");
    const updated = await db
      .update(households)
      .set({ name: c.req.valid("json").name })
      .where(eq(households.id, householdId(c)))
      .returning();
    if (updated.length === 0) throw new NotFoundError("Hogar no encontrado.");
    return c.body(null, 200);
  },
);

householdRoutes.openapi(
  createRoute({
    method: "post",
    path: "/api/households/invite-code/rotate",
    tags: ["Households"],
    operationId: "RotateInviteCode",
    summary: "Rota el código de invitación del hogar (solo admin)",
    middleware: [requireHousehold, requireAdmin] as const,
    responses: {
      200: jsonResponse(HouseholdDto, "Código rotado"),
      404: errors.notFound,
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const db = c.get("db");
    const [household] = await db
      .update(households)
      .set({ inviteCode: generateInviteCode() })
      .where(eq(households.id, householdId(c)))
      .returning();
    if (!household) throw new NotFoundError("Hogar no encontrado.");
    return c.json(toHouseholdDto(household), 200);
  },
);

householdRoutes.openapi(
  createRoute({
    method: "post",
    path: "/api/households/leave",
    tags: ["Households"],
    operationId: "LeaveHousehold",
    summary: "Abandona el hogar actual",
    middleware: [requireHousehold] as const,
    responses: { 200: emptyResponse("Abandonado"), 401: errors.unauthorized, 403: errors.forbidden },
  }),
  async (c) => {
    const user = c.get("user")!;
    const db = c.get("db");
    await promoteFallbackAdminIfNeeded(db, user);
    await db.update(userTable).set({ householdId: null, role: "Member" }).where(eq(userTable.id, user.id));
    return c.body(null, 200);
  },
);

householdRoutes.openapi(
  createRoute({
    method: "get",
    path: "/api/households/members",
    tags: ["Households"],
    operationId: "GetHouseholdMembers",
    summary: "Obtiene los miembros del hogar del usuario autenticado",
    middleware: [requireHousehold] as const,
    responses: { 200: jsonResponse(HouseholdMemberList, "Miembros"), 401: errors.unauthorized, 403: errors.forbidden },
  }),
  async (c) => {
    const db = c.get("db");
    const members = await db
      .select({ id: userTable.id, displayName: userTable.name, role: userTable.role, createdAt: userTable.createdAt })
      .from(userTable)
      .where(eq(userTable.householdId, householdId(c)))
      .orderBy(asc(userTable.createdAt));
    const dtos: HouseholdMember[] = members.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));
    return c.json(dtos, 200);
  },
);
