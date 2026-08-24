import { heyApiPlugin } from "@hey-api/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:5276";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  envPrefix: ["VITE_", "PUBLIC_"],
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({
      spa: { enabled: true },
    }),
    heyApiPlugin(),
    viteReact(),
  ],
  server: {
    port: 3000,
  },
});

export default config;
