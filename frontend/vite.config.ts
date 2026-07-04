import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { nitro } from 'nitro/vite';

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:5000'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    // The Nitro dev server handles requests before Vite's own `server.proxy`,
    // so /api and /hubs must be proxied at the Nitro level. In production the
    // vercel.json rewrites route these paths to the backend service instead.
    nitro({
      devProxy: {
        '/api/**': { target: BACKEND_URL, changeOrigin: true },
        '/hubs/**': { target: BACKEND_URL, changeOrigin: true, ws: true },
      },
    }),
    viteReact(),
  ],
  server: {
    port: 3000,
  },
})

export default config
