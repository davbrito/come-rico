import { createFileRoute } from "@tanstack/react-router";

import { generateFavicon } from "#/lib/og-favicon";

export const Route = createFileRoute("/_icons/favicon.png")({
  server: {
    handlers: {
      GET: () => generateFavicon(),
    },
  },
});
