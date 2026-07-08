import { eq, ilike } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { householdId, requireHousehold } from "../auth/session";
import type { AppEnv } from "../context";
import { tenantDb } from "../db/tenant";
import { uuidv7 } from "../db/uuid";
import { BusinessError } from "../http/errors";
import { validateJson } from "../http/validate";

interface TagDto {
  id: string;
  name: string;
}

const createSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre de la etiqueta es obligatorio.")
    .max(50, "El nombre no puede superar los 50 caracteres."),
});

export const tagRoutes = new Hono<AppEnv>();
tagRoutes.use("/api/tags", requireHousehold);
tagRoutes.use("/api/tags/*", requireHousehold);

tagRoutes.get("/api/tags", async (c) => {
  const tenant = tenantDb(c.get("db"), householdId(c));
  const rows = await tenant.tags.findMany();
  const dtos: TagDto[] = [...rows]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({ id: t.id, name: t.name }));
  return c.json(dtos);
});

tagRoutes.post("/api/tags", validateJson(createSchema), async (c) => {
  const tenant = tenantDb(c.get("db"), householdId(c));
  const name = c.req.valid("json").name.trim();

  const existing = await tenant.tags.findFirst(ilike(tenant.tags.table.name, name));
  if (existing) throw new BusinessError(`Ya existe una etiqueta llamada "${name}".`);

  const tag = await tenant.tags.insertOne({ id: uuidv7(), name, createdAt: new Date() });
  return c.json({ id: tag.id, name: tag.name } satisfies TagDto, 201);
});

tagRoutes.delete("/api/tags/:id", async (c) => {
  const tenant = tenantDb(c.get("db"), householdId(c));
  const id = c.req.param("id");
  const deleted = await tenant.tags.delete(eq(tenant.tags.table.id, id));
  return deleted.length > 0 ? c.body(null, 204) : c.json({ message: "Etiqueta no encontrada." }, 404);
});
