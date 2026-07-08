import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { householdId, requireHousehold } from "../auth/session";
import type { AppEnv } from "../context";
import { tenantDb, type TenantDb } from "../db/tenant";
import { uuidv7 } from "../db/uuid";
import { MEASUREMENT_UNITS, type MeasurementUnitValue } from "../domain/enums";
import { validateJson } from "../http/validate";
import { orphanByKey, resolveImageUrl, resolveUpload } from "./images/service";

// --------------------------------------------------------------------------
// DTOs (camelCase JSON, matching the .NET DishDto the frontend consumes)
// --------------------------------------------------------------------------

interface IngredientDto {
  id: string;
  name: string;
  amount: number;
  unit: MeasurementUnitValue;
}

interface TagRefDto {
  id: string;
  name: string;
}

interface DishDto {
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  ingredients: IngredientDto[];
  tags: TagRefDto[];
}

// Shape returned by the relational read below.
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

function toDishDto(row: DishRow, baseUrl: string): DishDto {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    description: row.description,
    imageUrl: resolveImageUrl(baseUrl, row.imageKey),
    isActive: row.isActive,
    createdAt: row.createdAt,
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

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

const ingredientInput = z.object({
  name: z
    .string()
    .min(1, "El nombre del ingrediente es obligatorio.")
    .max(200, "El nombre del ingrediente no puede superar los 200 caracteres."),
  amount: z.number().gt(0, "La cantidad debe ser mayor que cero."),
  unit: z.enum(MEASUREMENT_UNITS, { error: "La unidad de medida no es válida." }),
});

const nameField = z
  .string()
  .min(1, "El nombre del platillo es obligatorio.")
  .max(200, "El nombre no puede superar los 200 caracteres.");
const descriptionField = z.string().max(1000, "La descripción no puede superar los 1000 caracteres.").nullish();

const createSchema = z.object({
  name: nameField,
  description: descriptionField,
  imageUploadId: z.string().nullish(),
  ingredients: z.array(ingredientInput).optional(),
});

const updateSchema = z.object({
  name: nameField,
  description: descriptionField,
  imageUploadId: z.string().nullish(),
  removeImage: z.boolean().optional().default(false),
});

const setIngredientsSchema = z.object({ ingredients: z.array(ingredientInput) });

const setTagsSchema = z.object({
  tagNames: z.array(
    z
      .string()
      .min(1, "El nombre de la etiqueta es obligatorio.")
      .max(50, "El nombre de la etiqueta no puede superar los 50 caracteres."),
  ),
});

// --------------------------------------------------------------------------
// Business logic
// --------------------------------------------------------------------------

type IngredientInput = z.infer<typeof ingredientInput>;

async function insertIngredients(tenant: TenantDb, dishId: string, ingredients: IngredientInput[]) {
  if (ingredients.length === 0) return;
  await tenant.ingredients.insertMany(
    ingredients.map((i) => ({
      id: uuidv7(),
      dishId,
      name: i.name.trim(),
      amount: String(i.amount),
      unit: i.unit,
    })),
  );
}

async function resolveTagIds(tenant: TenantDb, tagNames: string[]): Promise<string[]> {
  // Trim, drop empties, and de-duplicate case-insensitively (keeping first).
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

// --------------------------------------------------------------------------
// Routes
// --------------------------------------------------------------------------

export const dishRoutes = new Hono<AppEnv>();
dishRoutes.use("/api/dishes", requireHousehold);
dishRoutes.use("/api/dishes/*", requireHousehold);

function tenantFor(c: Context<AppEnv>): TenantDb {
  return tenantDb(c.get("db"), householdId(c));
}

dishRoutes.get("/api/dishes", async (c) => {
  const tenant = tenantFor(c);
  const rows = await listActiveDishes(tenant);
  return c.json(rows.map((r) => toDishDto(r, c.env.IMAGE_PUBLIC_BASE_URL)));
});

dishRoutes.post("/api/dishes", validateJson(createSchema), async (c) => {
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
});

dishRoutes.put("/api/dishes/:id", validateJson(updateSchema), async (c) => {
  const tenant = tenantFor(c);
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const existing = await tenant.dishes.findFirst(eq(tenant.dishes.table.id, id));
  if (!existing) return c.json({ message: "Platillo no encontrado." }, 404);

  let imageKey = existing.imageKey;
  if (body.imageUploadId != null) imageKey = await resolveUpload(tenant, body.imageUploadId);
  else if (body.removeImage) imageKey = null;
  if (imageKey !== existing.imageKey) await orphanByKey(tenant, existing.imageKey);

  await tenant.dishes.update(
    { name: body.name, description: body.description ?? null, imageKey },
    eq(tenant.dishes.table.id, id),
  );
  const row = await loadDish(tenant, id);
  return c.json(toDishDto(row!, c.env.IMAGE_PUBLIC_BASE_URL));
});

dishRoutes.delete("/api/dishes/:id", async (c) => {
  const tenant = tenantFor(c);
  const id = c.req.param("id");
  const rows = await tenant.dishes.update({ isActive: false }, eq(tenant.dishes.table.id, id));
  return rows.length > 0 ? c.body(null, 204) : c.json({ message: "Platillo no encontrado." }, 404);
});

dishRoutes.put("/api/dishes/:id/ingredients", validateJson(setIngredientsSchema), async (c) => {
  const tenant = tenantFor(c);
  const id = c.req.param("id");
  const existing = await tenant.dishes.findFirst(eq(tenant.dishes.table.id, id));
  if (!existing) return c.json({ message: "Platillo no encontrado." }, 404);

  await tenant.ingredients.delete(eq(tenant.ingredients.table.dishId, id));
  await insertIngredients(tenant, id, c.req.valid("json").ingredients);
  const row = await loadDish(tenant, id);
  return c.json(toDishDto(row!, c.env.IMAGE_PUBLIC_BASE_URL));
});

dishRoutes.put("/api/dishes/:id/tags", validateJson(setTagsSchema), async (c) => {
  const tenant = tenantFor(c);
  const id = c.req.param("id");
  const existing = await tenant.dishes.findFirst(eq(tenant.dishes.table.id, id));
  if (!existing) return c.json({ message: "Platillo no encontrado." }, 404);

  const tagIds = await resolveTagIds(tenant, c.req.valid("json").tagNames);
  await tenant.replaceDishTags(id, tagIds);
  const row = await loadDish(tenant, id);
  return c.json(toDishDto(row!, c.env.IMAGE_PUBLIC_BASE_URL));
});
