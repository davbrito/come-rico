import { createFileRoute } from "@tanstack/react-router";

import { svgFaviconMarkup } from "#/lib/og-favicon";

export const Route = createFileRoute("/_icons/favicon.svg")({
  server: {
    handlers: {
      GET: () =>
        new Response(svgFaviconMarkup(), {
          headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control":
              process.env.NODE_ENV === "development"
                ? "no-cache, no-store"
                : "public, immutable, no-transform, max-age=31536000",
          },
        }),
    },
  },
});
