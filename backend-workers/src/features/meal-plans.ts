import { createRoute } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { householdId, requireHousehold } from "../auth/session";
import type { AppEnv } from "../context";
import { tenantDb, type TenantDb } from "../db/tenant";
import { uuidv7 } from "../db/uuid";
import type { MealTypeValue } from "../domain/enums";
import { BusinessError } from "../http/errors";
import { createApp, emptyResponse, errors, jsonResponse } from "../openapi/factory";
import {
  CreateMealPlanRequest,
  IdParam,
  MealPlanDto,
  MealPlanList,
  MealPlanRangeQuery,
  type MealPlan,
} from "../openapi/schemas";
import { resolveImageUrl } from "./images/service";

interface MealPlanRow {
  id: string;
  date: string;
  mealType: MealTypeValue;
  dishId: string;
  dish: { name: string; imageKey: string | null };
}

const toDto = (row: MealPlanRow, baseUrl: string): MealPlan => ({
  id: row.id,
  date: row.date,
  mealType: row.mealType,
  dishId: row.dishId,
  dishName: row.dish.name,
  dishImageUrl: resolveImageUrl(baseUrl, row.dish.imageKey),
});

const tenantFor = (c: Context<AppEnv>): TenantDb => tenantDb(c.get("db"), householdId(c));
const notFound = { message: "Plan de comidas no encontrado." };

export const mealPlanRoutes = createApp();
mealPlanRoutes.use("/api/meal-plans", requireHousehold);
mealPlanRoutes.use("/api/meal-plans/*", requireHousehold);

mealPlanRoutes.openapi(
  createRoute({
    method: "get",
    path: "/api/meal-plans",
    tags: ["MealPlans"],
    operationId: "GetMealPlans",
    summary: "Obtiene el plan de comidas del hogar en un rango de fechas",
    request: { query: MealPlanRangeQuery },
    responses: {
      200: jsonResponse(MealPlanList, "Planes"),
      422: errors.validation,
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const tenant = tenantFor(c);
    const { from, to } = c.req.valid("query");
    const rows = (await tenant.join((db, hid) =>
      db.query.mealPlans.findMany({
        where: (m, { and: a, eq: e, gte, lte }) => a(e(m.householdId, hid), gte(m.date, from), lte(m.date, to)),
        with: { dish: true },
        orderBy: (m, { asc }) => [asc(m.date), asc(m.mealType)],
      }),
    )) as MealPlanRow[];
    return c.json(rows.map((r) => toDto(r, c.env.IMAGE_PUBLIC_BASE_URL)), 200);
  },
);

mealPlanRoutes.openapi(
  createRoute({
    method: "post",
    path: "/api/meal-plans",
    tags: ["MealPlans"],
    operationId: "CreateMealPlan",
    summary: "Planifica un platillo para una fecha y comida",
    request: { body: { content: { "application/json": { schema: CreateMealPlanRequest } }, required: true } },
    responses: {
      201: jsonResponse(MealPlanDto, "Plan creado"),
      400: errors.badRequest,
      422: errors.validation,
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const tenant = tenantFor(c);
    const { dishId, date, mealType } = c.req.valid("json");
    const dish = await tenant.dishes.findFirst(
      and(eq(tenant.dishes.table.id, dishId), eq(tenant.dishes.table.isActive, true)),
    );
    if (!dish) throw new BusinessError("El platillo no existe o está inactivo.");
    const clash = await tenant.mealPlans.findFirst(
      and(
        eq(tenant.mealPlans.table.date, date),
        eq(tenant.mealPlans.table.mealType, mealType),
        eq(tenant.mealPlans.table.dishId, dishId),
      ),
    );
    if (clash) throw new BusinessError("Ese platillo ya está planificado para esa comida.");
    const plan = await tenant.mealPlans.insertOne({ id: uuidv7(), dishId, date, mealType, createdAt: new Date() });
    return c.json(
      {
        id: plan.id,
        date: plan.date,
        mealType: plan.mealType,
        dishId: dish.id,
        dishName: dish.name,
        dishImageUrl: resolveImageUrl(c.env.IMAGE_PUBLIC_BASE_URL, dish.imageKey),
      },
      201,
    );
  },
);

mealPlanRoutes.openapi(
  createRoute({
    method: "get",
    path: "/api/meal-plans/{id}",
    tags: ["MealPlans"],
    operationId: "GetMealPlan",
    summary: "Obtiene un plan de comidas por su identificador",
    request: { params: IdParam },
    responses: {
      200: jsonResponse(MealPlanDto, "Plan"),
      404: errors.notFound,
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const tenant = tenantFor(c);
    const id = c.req.valid("param").id;
    const row = (await tenant.join((db, hid) =>
      db.query.mealPlans.findFirst({
        where: (m, { and: a, eq: e }) => a(e(m.householdId, hid), e(m.id, id)),
        with: { dish: true },
      }),
    )) as MealPlanRow | undefined;
    return row ? c.json(toDto(row, c.env.IMAGE_PUBLIC_BASE_URL), 200) : c.json(notFound, 404);
  },
);

mealPlanRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/api/meal-plans/{id}",
    tags: ["MealPlans"],
    operationId: "DeleteMealPlan",
    summary: "Elimina una entrada del plan de comidas",
    request: { params: IdParam },
    responses: {
      204: emptyResponse("Eliminado"),
      404: errors.notFound,
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const tenant = tenantFor(c);
    const deleted = await tenant.mealPlans.delete(eq(tenant.mealPlans.table.id, c.req.valid("param").id));
    return deleted.length > 0 ? c.body(null, 204) : c.json(notFound, 404);
  },
);
