import { sessionMiddleware } from "./auth/session";
import { createDb } from "./db/client";
import { registerErrorHandler } from "./http/errors";
import { sweepOrphanedFiles } from "./images/cleanup";
import { mountApiRoutes, OPENAPI_INFO } from "./openapi/document";
import { createApp } from "./openapi/factory";
import { hubRoutes } from "./realtime/routes";
import { RouletteRoom } from "./realtime/roulette-room";

// The ComeRico backend, running on Cloudflare Workers.
//
// This file is intentionally thin: it wires middleware and mounts route
// modules. Business logic lives in src/features/**, HTTP mapping in the route
// modules, mirroring the "endpoints map HTTP to handlers" rule from the
// original ASP.NET Core backend.

const app = createApp();

// Map thrown errors to the same JSON/status shapes the .NET backend produced.
registerErrorHandler(app);

// Resolve DB + auth + session for every request.
app.use("*", sessionMiddleware);

// Liveness probe.
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Documented API routes (auth, households, dishes, tags, meal plans, shopping,
// roulette, images).
mountApiRoutes(app);

// Real-time roulette WebSocket (not part of the OpenAPI document).
app.route("/", hubRoutes);

// OpenAPI document — the frontend's typed client is generated from this
// (snapshotted to backend-workers/openapi.json via `pnpm openapi:snapshot`).
app.doc31("/openapi/v1.json", OPENAPI_INFO);

// The Durable Object class must be exported from the Worker entrypoint for the
// ROULETTE_ROOM binding to resolve.
export { RouletteRoom };

// Named export of the Hono app for tests (app.request); production uses the
// default handler below.
export { app };

export default {
  fetch: app.fetch,
  // Weekly cron (wrangler.jsonc triggers) → orphaned-image sweep.
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const db = createDb(env.HYPERDRIVE);
    ctx.waitUntil(sweepOrphanedFiles(db, env.BUCKET));
  },
} satisfies ExportedHandler<Env>;
