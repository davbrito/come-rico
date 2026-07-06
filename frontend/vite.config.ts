import { heyApiPlugin } from "@hey-api/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:5276";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  envPrefix: ["VITE_", "PUBLIC_"],
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    heyApiPlugin(),
    nitro({
      devProxy: {
        "/api/**": { target: BACKEND_URL, changeOrigin: true },
        "/hubs/**": { target: BACKEND_URL, changeOrigin: true, ws: true },
      },
      features: {
        websocket: true,
      },
    }),
    viteReact(),
  ],
  server: {
    port: 3000,
  },
});

export default config;
