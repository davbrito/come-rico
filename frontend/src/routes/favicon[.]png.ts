import { createFileRoute } from "@tanstack/react-router";

import { generateFavicon } from "#/lib/og-favicon";

export const Route = createFileRoute("/favicon.png")({
  server: {
    handlers: {
      GET: () => generateFavicon(),
    },
  },
});
