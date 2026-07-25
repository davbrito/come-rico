import { createRoute } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { householdId, requireHousehold } from "../../auth/session";
import { tenantDb } from "../../db/tenant";
import { uuidv7 } from "../../db/uuid";
import { createApp, errors, jsonResponse } from "../../openapi/factory";
import { CreateUploadRequest, UploadTicketDto } from "../../openapi/schemas";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "./rules";

// Direct-upload flow (proposal Option A): no presigned URLs, no bucket CORS.
//   POST /api/images     → registers a Pending StoredFile, returns a ticket
//                          whose uploadUrl is the same-origin PUT endpoint.
//   PUT  /api/images/:id  → streams the body straight into R2 at the key.
// The PUT is a plain (undocumented) route: the frontend uploads to it with a
// raw fetch, not the generated client.

export const imageRoutes = createApp();
imageRoutes.use("/api/images", requireHousehold);
imageRoutes.use("/api/images/*", requireHousehold);

imageRoutes.openapi(
  createRoute({
    method: "post",
    path: "/api/images",
    tags: ["Images"],
    operationId: "CreateUpload",
    summary: "Crea un ticket de subida: URL de subida + id del archivo",
    request: { body: { content: { "application/json": { schema: CreateUploadRequest } }, required: true } },
    responses: {
      200: jsonResponse(UploadTicketDto, "Ticket de subida"),
      422: errors.validation,
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const tenant = tenantDb(c.get("db"), householdId(c));
    const body = c.req.valid("json");
    const ext = ALLOWED_IMAGE_TYPES[body.contentType]!;
    const key = `${body.keyFolder}/${householdId(c)}/${crypto.randomUUID().replace(/-/g, "")}${ext}`;
    const file = await tenant.storedFiles.insertOne({
      id: uuidv7(),
      key,
      contentType: body.contentType,
      createdAt: new Date(),
    });
    return c.json({ uploadId: file.id, uploadUrl: `/api/images/${file.id}` }, 200);
  },
);

// Binary upload target (not part of the OpenAPI document).
imageRoutes.put("/api/images/:id", async (c) => {
  const tenant = tenantDb(c.get("db"), householdId(c));
  const file = await tenant.storedFiles.findFirst(eq(tenant.storedFiles.table.id, c.req.param("id")));
  if (!file) return c.json({ message: "Ticket de subida no encontrado." }, 404);

  const contentType = c.req.header("content-type");
  if (contentType !== file.contentType) {
    return c.json({ message: "El tipo de contenido no coincide con el ticket." }, 400);
  }
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ message: "El archivo está vacío." }, 400);
  if (bytes.byteLength > MAX_IMAGE_BYTES) return c.json({ message: "La imagen no puede superar 5 MB." }, 413);

  await c.env.BUCKET.put(file.key, bytes, { httpMetadata: { contentType: file.contentType } });
  return c.body(null, 204);
});
