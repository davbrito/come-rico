import { Hono } from "hono";
import { authRoutes } from "./auth/routes";
import { sessionMiddleware } from "./auth/session";
import { householdRoutes } from "./households/routes";
import type { AppEnv } from "./context";
import { registerErrorHandler } from "./http/errors";
import { RouletteRoom } from "./realtime/roulette-room";

// The ComeRico backend, running on Cloudflare Workers.
//
// This file is intentionally thin: it wires middleware and mounts route
// modules. Business logic lives in src/features/**, HTTP mapping in the route
// modules, mirroring the "endpoints map HTTP to handlers" rule from the
// original ASP.NET Core backend.

const app = new Hono<AppEnv>();

// Map thrown errors to the same JSON/status shapes the .NET backend produced.
registerErrorHandler(app);

// Resolve DB + auth + session for every request.
app.use("*", sessionMiddleware);

// Liveness probe.
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Auth (login/register/logout/me) — BFF cookie sessions.
app.route("/", authRoutes);

// Households (create/join/leave/rename/rotate/members).
app.route("/", householdRoutes);

// The Durable Object class must be exported from the Worker entrypoint for the
// ROULETTE_ROOM binding to resolve.
export { RouletteRoom };

export default app;
