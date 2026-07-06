import { createFileRoute } from "@tanstack/react-router";

import { generateOgImage } from "#/lib/og-image";

export const Route = createFileRoute("/og-image")({
  server: {
    handlers: {
      GET: async () => {
        const response = await generateOgImage();
        return response;
      },
    },
  },
});
