import { fileURLToPath } from "node:url";

import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: fileURLToPath(new URL("../backend-workers/openapi.json", import.meta.url)),
  output: "src/api",
  plugins: [
    { name: "@hey-api/client-axios", runtimeConfigPath: "#/lib/api.ts" },
    { name: "@tanstack/react-query" },
  ],
});
