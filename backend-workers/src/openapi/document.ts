import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context";
import { authRoutes } from "../auth/routes";
import { dishRoutes } from "../features/dishes";
import { imageRoutes } from "../features/images/routes";
import { mealPlanRoutes } from "../features/meal-plans";
import { rouletteRoutes } from "../features/roulette";
import { shoppingRoutes } from "../features/shopping";
import { tagRoutes } from "../features/tags";
import { householdRoutes } from "../households/routes";
import { createApp } from "./factory";

export const OPENAPI_INFO = {
  openapi: "3.1.0" as const,
  info: { title: "ComeRico API", version: "1.0.0" },
};

// Mount the documented API route modules. Kept separate from index.ts so the
// OpenAPI snapshot can be generated in Node without importing the Durable
// Object entrypoint (which pulls in the `cloudflare:workers` module).
export function mountApiRoutes(app: OpenAPIHono<AppEnv>): OpenAPIHono<AppEnv> {
  app.route("/", authRoutes);
  app.route("/", householdRoutes);
  app.route("/", dishRoutes);
  app.route("/", tagRoutes);
  app.route("/", mealPlanRoutes);
  app.route("/", shoppingRoutes);
  app.route("/", rouletteRoutes);
  app.route("/", imageRoutes);
  return app;
}

/** Build the OpenAPI 3.1 document (used by the snapshot script). */
export function buildOpenApiDocument() {
  return mountApiRoutes(createApp()).getOpenAPI31Document(OPENAPI_INFO);
}
