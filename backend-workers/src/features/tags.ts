import { createRoute } from "@hono/zod-openapi";
import { eq, ilike } from "drizzle-orm";
import { householdId, requireHousehold } from "../auth/session";
import { tenantDb } from "../db/tenant";
import { uuidv7 } from "../db/uuid";
import { BusinessError } from "../http/errors";
import { createApp, emptyResponse, errors, jsonResponse } from "../openapi/factory";
import { CreateTagRequest, IdParam, TagDto, TagList } from "../openapi/schemas";

export const tagRoutes = createApp();
tagRoutes.use("/api/tags", requireHousehold);
tagRoutes.use("/api/tags/*", requireHousehold);

tagRoutes.openapi(
  createRoute({
    method: "get",
    path: "/api/tags",
    tags: ["Tags"],
    operationId: "GetTags",
    summary: "Obtiene las etiquetas del hogar",
    responses: { 200: jsonResponse(TagList, "Etiquetas"), 401: errors.unauthorized, 403: errors.forbidden },
  }),
  async (c) => {
    const tenant = tenantDb(c.get("db"), householdId(c));
    const rows = await tenant.tags.findMany();
    const dtos = [...rows].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ id: t.id, name: t.name }));
    return c.json(dtos, 200);
  },
);

tagRoutes.openapi(
  createRoute({
    method: "post",
    path: "/api/tags",
    tags: ["Tags"],
    operationId: "CreateTag",
    summary: "Crea una nueva etiqueta",
    request: { body: { content: { "application/json": { schema: CreateTagRequest } }, required: true } },
    responses: {
      201: jsonResponse(TagDto, "Etiqueta creada"),
      400: errors.badRequest,
      422: errors.validation,
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const tenant = tenantDb(c.get("db"), householdId(c));
    const name = c.req.valid("json").name.trim();
    const existing = await tenant.tags.findFirst(ilike(tenant.tags.table.name, name));
    if (existing) throw new BusinessError(`Ya existe una etiqueta llamada "${name}".`);
    const tag = await tenant.tags.insertOne({ id: uuidv7(), name, createdAt: new Date() });
    return c.json({ id: tag.id, name: tag.name }, 201);
  },
);

tagRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/api/tags/{id}",
    tags: ["Tags"],
    operationId: "DeleteTag",
    summary: "Elimina una etiqueta",
    request: { params: IdParam },
    responses: {
      204: emptyResponse("Eliminada"),
      404: errors.notFound,
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const tenant = tenantDb(c.get("db"), householdId(c));
    const deleted = await tenant.tags.delete(eq(tenant.tags.table.id, c.req.valid("param").id));
    return deleted.length > 0 ? c.body(null, 204) : c.json({ message: "Etiqueta no encontrada." }, 404);
  },
);
