import { cloudflare } from "@cloudflare/vite-plugin";
import { heyApiPlugin } from "@hey-api/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:5276";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  envPrefix: ["VITE_", "PUBLIC_"],
  plugins: [
    devtools(),
    tailwindcss(),
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // SST points this at the wrangler config it generates for the
      // TanStackStart component. Falls back to ./wrangler.jsonc for plain
      // `pnpm build` / `pnpm dev` outside of SST.
      configPath: process.env.SST_WRANGLER_PATH,
    }),
    tanstackStart(),
    heyApiPlugin(),
    viteReact(),
  ],
  server: {
    port: 3000,
    // Dev only. In production /api/** is handled by the proxy route in
    // src/routes/api.$.ts, off the BACKEND_URL binding.
    proxy: {
      "/api": { target: BACKEND_URL, changeOrigin: true },
    },
  },
});

export default config;
