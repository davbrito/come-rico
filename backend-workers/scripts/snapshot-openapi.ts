import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildOpenApiDocument } from "../src/openapi/document";

// Writes the OpenAPI document to backend-workers/openapi.json — the static file
// the frontend generates its typed client from. Run after changing any route
// or schema: `pnpm openapi:snapshot`.
const doc = buildOpenApiDocument();
const outPath = join(import.meta.dirname, "..", "openapi.json");
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Wrote ${outPath} (${Object.keys(doc.paths ?? {}).length} paths)`);
