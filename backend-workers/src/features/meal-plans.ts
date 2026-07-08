import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { householdId, requireHousehold } from "../auth/session";
import type { AppEnv } from "../context";
import { tenantDb, type TenantDb } from "../db/tenant";
import { uuidv7 } from "../db/uuid";
import { MEAL_TYPES, type MealTypeValue } from "../domain/enums";
import { BusinessError } from "../http/errors";
import { validateJson, validateQuery } from "../http/validate";
import { resolveImageUrl } from "./images/service";

interface MealPlanDto {
  id: string;
  date: string;
  mealType: MealTypeValue;
  dishId: string;
  dishName: string;
  dishImageUrl: string | null;
}

interface MealPlanRow {
  id: string;
  date: string;
  mealType: MealTypeValue;
  dishId: string;
  dish: { name: string; imageKey: string | null };
}

function toDto(row: MealPlanRow, baseUrl: string): MealPlanDto {
  return {
    id: row.id,
    date: row.date,
    mealType: row.mealType,
    dishId: row.dishId,
    dishName: row.dish.name,
    dishImageUrl: resolveImageUrl(baseUrl, row.dish.imageKey),
  };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida.");

const rangeSchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((v) => v.to >= v.from, { error: "La fecha final debe ser posterior o igual a la inicial.", path: ["to"] });

const createSchema = z.object({
  dishId: z.string().min(1, "El platillo es obligatorio."),
  date: isoDate,
  mealType: z.enum(MEAL_TYPES, { error: "El tipo de comida no es válido." }),
});

const tenantFor = (c: Context<AppEnv>): TenantDb => tenantDb(c.get("db"), householdId(c));

export const mealPlanRoutes = new Hono<AppEnv>();
mealPlanRoutes.use("/api/meal-plans", requireHousehold);
mealPlanRoutes.use("/api/meal-plans/*", requireHousehold);

mealPlanRoutes.get("/api/meal-plans", validateQuery(rangeSchema), async (c) => {
  const tenant = tenantFor(c);
  const { from, to } = c.req.valid("query");
  const rows = (await tenant.join((db, hid) =>
    db.query.mealPlans.findMany({
      where: (m, { and: a, eq: e, gte, lte }) => a(e(m.householdId, hid), gte(m.date, from), lte(m.date, to)),
      with: { dish: true },
      orderBy: (m, { asc }) => [asc(m.date), asc(m.mealType)],
    }),
  )) as MealPlanRow[];
  return c.json(rows.map((r) => toDto(r, c.env.IMAGE_PUBLIC_BASE_URL)));
});

mealPlanRoutes.post("/api/meal-plans", validateJson(createSchema), async (c) => {
  const tenant = tenantFor(c);
  const { dishId, date, mealType } = c.req.valid("json");

  const dish = await tenant.dishes.findFirst(and(eq(tenant.dishes.table.id, dishId), eq(tenant.dishes.table.isActive, true)));
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
  const dto: MealPlanDto = {
    id: plan.id,
    date: plan.date,
    mealType: plan.mealType,
    dishId: dish.id,
    dishName: dish.name,
    dishImageUrl: resolveImageUrl(c.env.IMAGE_PUBLIC_BASE_URL, dish.imageKey),
  };
  return c.json(dto, 201);
});

mealPlanRoutes.get("/api/meal-plans/:id", async (c) => {
  const tenant = tenantFor(c);
  const id = c.req.param("id");
  const row = (await tenant.join((db, hid) =>
    db.query.mealPlans.findFirst({
      where: (m, { and: a, eq: e }) => a(e(m.householdId, hid), e(m.id, id)),
      with: { dish: true },
    }),
  )) as MealPlanRow | undefined;
  return row ? c.json(toDto(row, c.env.IMAGE_PUBLIC_BASE_URL)) : c.json({ message: "Plan de comidas no encontrado." }, 404);
});

mealPlanRoutes.delete("/api/meal-plans/:id", async (c) => {
  const tenant = tenantFor(c);
  const deleted = await tenant.mealPlans.delete(eq(tenant.mealPlans.table.id, c.req.param("id")));
  return deleted.length > 0 ? c.body(null, 204) : c.json({ message: "Plan de comidas no encontrado." }, 404);
});
