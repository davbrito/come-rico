import { createRoute, z } from "@hono/zod-openapi";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../src/context";
import { BusinessError, ForbiddenError, registerErrorHandler } from "../src/http/errors";
import { createApp, errors, jsonResponse } from "../src/openapi/factory";

// Error → status mapping (registerErrorHandler).
describe("error mapping", () => {
  function makeApp() {
    const app = new Hono<AppEnv>();
    registerErrorHandler(app);
    app.get("/business", () => {
      throw new BusinessError("regla de negocio");
    });
    app.get("/forbidden", () => {
      throw new ForbiddenError("solo admin");
    });
    app.get("/boom", () => {
      throw new Error("kaboom");
    });
    return app;
  }
  const app = makeApp();

  it("maps BusinessError to 400 { message }", async () => {
    const res = await app.request("/business");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "regla de negocio" });
  });

  it("maps ForbiddenError to 403 { message }", async () => {
    const res = await app.request("/forbidden");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: "solo admin" });
  });

  it("maps unexpected errors to 500 with the Spanish fallback", async () => {
    const res = await app.request("/boom");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ message: "Ocurrió un error interno. Por favor inténtelo de nuevo." });
  });
});

// The OpenAPI validation hook reproduces the .NET 422 body shape.
describe("openapi validation hook", () => {
  const app = createApp();
  const Body = z.object({ name: z.string().min(1, "requerido") });
  app.openapi(
    createRoute({
      method: "post",
      path: "/echo",
      request: { body: { content: { "application/json": { schema: Body } }, required: true } },
      responses: { 200: jsonResponse(Body, "ok"), 422: errors.validation },
    }),
    (c) => c.json(c.req.valid("json"), 200),
  );

  it("returns 422 with { errors: [{ field, message }] } on invalid body", async () => {
    const res = await app.request("/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ errors: [{ field: "name", message: "requerido" }] });
  });

  it("passes a valid body through", async () => {
    const res = await app.request("/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "arroz" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "arroz" });
  });
});
