import { fileURLToPath } from "node:url";

import { heyApiPlugin } from "@hey-api/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:5000";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    heyApiPlugin({
      config: {
        input: fileURLToPath(new URL("../backend/ComeRico.Api/ComeRico.Api.json", import.meta.url)),
        output: "src/api",
        plugins: [
          {
            name: "@hey-api/client-fetch",
            runtimeConfigPath: "#/lib/api.ts",
          },
          "@tanstack/react-query",
        ],
      },
    }),
    nitro({
      devProxy: {
        "/api/**": { target: BACKEND_URL, changeOrigin: true },
        "/hubs/**": { target: BACKEND_URL, changeOrigin: true, ws: true },
      },
    }),
    viteReact(),
  ],
  server: {
    port: 3000,
  },
});

export default config;
