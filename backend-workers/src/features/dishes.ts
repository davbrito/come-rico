import { createRoute } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { householdId, requireHousehold } from "../auth/session";
import type { AppEnv } from "../context";
import { tenantDb, type TenantDb } from "../db/tenant";
import { uuidv7 } from "../db/uuid";
import type { MeasurementUnitValue } from "../domain/enums";
import { createApp, emptyResponse, errors, jsonResponse } from "../openapi/factory";
import {
  CreateDishRequest,
  DishDto,
  DishList,
  IdParam,
  SetIngredientsRequest,
  SetTagsRequest,
  UpdateDishRequest,
  type Dish,
  type IngredientInputType,
} from "../openapi/schemas";
import { orphanByKey, resolveImageUrl, resolveUpload } from "./images/service";

// Row shape returned by the relational reads below.
interface DishRow {
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  imageKey: string | null;
  isActive: boolean;
  createdAt: Date;
  ingredients: { id: string; name: string; amount: string; unit: MeasurementUnitValue }[];
  dishTags: { tag: { id: string; name: string } }[];
}

function toDishDto(row: DishRow, baseUrl: string): Dish {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    description: row.description,
    imageUrl: resolveImageUrl(baseUrl, row.imageKey),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    ingredients: [...row.ingredients]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((i) => ({ id: i.id, name: i.name, amount: Number(i.amount), unit: i.unit })),
    tags: row.dishTags
      .map((dt) => dt.tag)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({ id: t.id, name: t.name })),
  };
}

// Relational reads via the tenant join() escape hatch — the where callbacks
// constrain by household, so no schema import is needed here.
function loadDish(tenant: TenantDb, dishId: string): Promise<DishRow | undefined> {
  return tenant.join((db, hid) =>
    db.query.dishes.findFirst({
      where: (d, { and, eq: eqq }) => and(eqq(d.householdId, hid), eqq(d.id, dishId)),
      with: { ingredients: true, dishTags: { with: { tag: true } } },
    }),
  ) as Promise<DishRow | undefined>;
}

function listActiveDishes(tenant: TenantDb): Promise<DishRow[]> {
  return tenant.join((db, hid) =>
    db.query.dishes.findMany({
      where: (d, { and, eq: eqq }) => and(eqq(d.householdId, hid), eqq(d.isActive, true)),
      with: { ingredients: true, dishTags: { with: { tag: true } } },
      orderBy: (d, { asc }) => asc(d.name),
    }),
  ) as Promise<DishRow[]>;
}

async function insertIngredients(tenant: TenantDb, dishId: string, ingredients: IngredientInputType[]) {
  if (ingredients.length === 0) return;
  await tenant.ingredients.insertMany(
    ingredients.map((i) => ({ id: uuidv7(), dishId, name: i.name.trim(), amount: String(i.amount), unit: i.unit })),
  );
}

async function resolveTagIds(tenant: TenantDb, tagNames: string[]): Promise<string[]> {
  const names = tagNames
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .filter((n, i, arr) => arr.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i);
  const existing = await tenant.tags.findMany();
  const byLower = new Map(existing.map((t) => [t.name.toLowerCase(), t]));
  const ids: string[] = [];
  for (const name of names) {
    const found = byLower.get(name.toLowerCase());
    if (found) {
      ids.push(found.id);
    } else {
      const created = await tenant.tags.insertOne({ id: uuidv7(), name, createdAt: new Date() });
      byLower.set(name.toLowerCase(), created);
      ids.push(created.id);
    }
  }
  return ids;
}

const tenantFor = (c: Context<AppEnv>): TenantDb => tenantDb(c.get("db"), householdId(c));
const notFound = { message: "Platillo no encontrado." };

export const dishRoutes = createApp();
dishRoutes.use("/api/dishes", requireHousehold);
dishRoutes.use("/api/dishes/*", requireHousehold);

dishRoutes.openapi(
  createRoute({
    method: "get",
    path: "/api/dishes",
    tags: ["Dishes"],
    operationId: "GetDishes",
    summary: "Obtiene los platillos del hogar",
    responses: { 200: jsonResponse(DishList, "Platillos"), 401: errors.unauthorized, 403: errors.forbidden },
  }),
  async (c) => {
    const tenant = tenantFor(c);
    const rows = await listActiveDishes(tenant);
    return c.json(rows.map((r) => toDishDto(r, c.env.IMAGE_PUBLIC_BASE_URL)), 200);
  },
);

dishRoutes.openapi(
  createRoute({
    method: "post",
    path: "/api/dishes",
    tags: ["Dishes"],
    operationId: "CreateDish",
    summary: "Crea un nuevo platillo",
    request: { body: { content: { "application/json": { schema: CreateDishRequest } }, required: true } },
    responses: {
      201: jsonResponse(DishDto, "Platillo creado"),
      400: errors.badRequest,
      422: errors.validation,
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const tenant = tenantFor(c);
    const body = c.req.valid("json");
    const imageKey = await resolveUpload(tenant, body.imageUploadId);
    const dish = await tenant.dishes.insertOne({
      id: uuidv7(),
      name: body.name,
      description: body.description ?? null,
      imageKey,
      isActive: true,
      createdAt: new Date(),
    });
    await insertIngredients(tenant, dish.id, body.ingredients ?? []);
    const row = await loadDish(tenant, dish.id);
    return c.json(toDishDto(row!, c.env.IMAGE_PUBLIC_BASE_URL), 201);
  },
);

dishRoutes.openapi(
  createRoute({
    method: "put",
    path: "/api/dishes/{id}",
    tags: ["Dishes"],
    operationId: "UpdateDish",
    summary: "Actualiza un platillo existente",
    request: { params: IdParam, body: { content: { "application/json": { schema: UpdateDishRequest } }, required: true } },
    responses: {
      200: jsonResponse(DishDto, "Platillo actualizado"),
      404: errors.notFound,
      422: errors.validation,
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const tenant = tenantFor(c);
    const id = c.req.valid("param").id;
    const body = c.req.valid("json");
    const existing = await tenant.dishes.findFirst(eq(tenant.dishes.table.id, id));
    if (!existing) return c.json(notFound, 404);

    let imageKey = existing.imageKey;
    if (body.imageUploadId != null) imageKey = await resolveUpload(tenant, body.imageUploadId);
    else if (body.removeImage) imageKey = null;
    if (imageKey !== existing.imageKey) await orphanByKey(tenant, existing.imageKey);

    await tenant.dishes.update(
      { name: body.name, description: body.description ?? null, imageKey },
      eq(tenant.dishes.table.id, id),
    );
    const row = await loadDish(tenant, id);
    return c.json(toDishDto(row!, c.env.IMAGE_PUBLIC_BASE_URL), 200);
  },
);

dishRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/api/dishes/{id}",
    tags: ["Dishes"],
    operationId: "DeleteDish",
    summary: "Elimina (desactiva) un platillo",
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
    const rows = await tenant.dishes.update({ isActive: false }, eq(tenant.dishes.table.id, c.req.valid("param").id));
    return rows.length > 0 ? c.body(null, 204) : c.json(notFound, 404);
  },
);

dishRoutes.openapi(
  createRoute({
    method: "put",
    path: "/api/dishes/{id}/ingredients",
    tags: ["Dishes"],
    operationId: "SetDishIngredients",
    summary: "Reemplaza los ingredientes de un platillo",
    request: {
      params: IdParam,
      body: { content: { "application/json": { schema: SetIngredientsRequest } }, required: true },
    },
    responses: {
      200: jsonResponse(DishDto, "Platillo actualizado"),
      404: errors.notFound,
      422: errors.validation,
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const tenant = tenantFor(c);
    const id = c.req.valid("param").id;
    const existing = await tenant.dishes.findFirst(eq(tenant.dishes.table.id, id));
    if (!existing) return c.json(notFound, 404);
    await tenant.ingredients.delete(eq(tenant.ingredients.table.dishId, id));
    await insertIngredients(tenant, id, c.req.valid("json").ingredients);
    const row = await loadDish(tenant, id);
    return c.json(toDishDto(row!, c.env.IMAGE_PUBLIC_BASE_URL), 200);
  },
);

dishRoutes.openapi(
  createRoute({
    method: "put",
    path: "/api/dishes/{id}/tags",
    tags: ["Dishes"],
    operationId: "SetDishTags",
    summary: "Reemplaza las etiquetas de un platillo",
    request: { params: IdParam, body: { content: { "application/json": { schema: SetTagsRequest } }, required: true } },
    responses: {
      200: jsonResponse(DishDto, "Platillo actualizado"),
      404: errors.notFound,
      422: errors.validation,
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const tenant = tenantFor(c);
    const id = c.req.valid("param").id;
    const existing = await tenant.dishes.findFirst(eq(tenant.dishes.table.id, id));
    if (!existing) return c.json(notFound, 404);
    const tagIds = await resolveTagIds(tenant, c.req.valid("json").tagNames);
    await tenant.replaceDishTags(id, tagIds);
    const row = await loadDish(tenant, id);
    return c.json(toDishDto(row!, c.env.IMAGE_PUBLIC_BASE_URL), 200);
  },
);
