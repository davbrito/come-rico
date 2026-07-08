import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { householdId, requireHousehold } from "../../auth/session";
import type { AppEnv } from "../../context";
import { tenantDb } from "../../db/tenant";
import { uuidv7 } from "../../db/uuid";
import { validateJson } from "../../http/validate";
import { ALLOWED_IMAGE_TYPES, ALLOWED_KEY_FOLDERS, MAX_IMAGE_BYTES } from "./rules";

// Direct-upload flow (proposal Option A): no presigned URLs, no bucket CORS.
//   POST /api/images         → registers a Pending StoredFile, returns a ticket
//                              whose uploadUrl is this same-origin PUT endpoint.
//   PUT  /api/images/:id      → streams the body straight into R2 at the key.
// Consuming commands (CreateDish/UpdateDish) flip the file to Active by id.

interface UploadTicketDto {
  uploadId: string;
  uploadUrl: string;
}

const createSchema = z.object({
  type: z.literal("image", { error: "Tipo no soportado. Usa 'image'." }),
  keyFolder: z.enum(ALLOWED_KEY_FOLDERS, { error: "Carpeta de destino no permitida." }),
  contentType: z.string().refine((ct) => ct in ALLOWED_IMAGE_TYPES, {
    error: "Formato no soportado. Usa JPG, PNG, WebP, AVIF o GIF.",
  }),
  sizeBytes: z
    .number()
    .int()
    .gt(0, "El archivo está vacío.")
    .max(MAX_IMAGE_BYTES, "La imagen no puede superar 5 MB."),
});

export const imageRoutes = new Hono<AppEnv>();
imageRoutes.use("/api/images", requireHousehold);
imageRoutes.use("/api/images/*", requireHousehold);

imageRoutes.post("/api/images", validateJson(createSchema), async (c) => {
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

  return c.json({ uploadId: file.id, uploadUrl: `/api/images/${file.id}` } satisfies UploadTicketDto);
});

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
