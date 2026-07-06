import { createFileRoute } from "@tanstack/react-router";

import { svgFaviconMarkup } from "#/lib/og-favicon";

export const Route = createFileRoute("/_icons/favicon.svg")({
  server: {
    handlers: {
      GET: () =>
        new Response(svgFaviconMarkup(), {
          headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "public, max-age=86400, immutable",
          },
        }),
    },
  },
});
