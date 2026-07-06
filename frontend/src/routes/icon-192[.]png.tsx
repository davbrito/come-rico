import { createFileRoute } from "@tanstack/react-router";

import { generatePwaIcon } from "#/lib/og-favicon";

export const Route = createFileRoute("/icon-192.png")({
  server: {
    handlers: {
      GET: async () => await generatePwaIcon(192),
    },
  },
});
