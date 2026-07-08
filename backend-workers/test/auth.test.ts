import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

// These exercise the auth wiring that does NOT require a database (no session
// cookie → getSession short-circuits before any query). Full sign-up/sign-in
// flows are covered by the DB-backed contract suite.
describe("auth wiring", () => {
  it("returns 401 from /api/auth/me when unauthenticated", async () => {
    const ctx = createExecutionContext();
    const res = await app.request("/api/auth/me", {}, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 401 from /api/auth/logout when unauthenticated", async () => {
    const ctx = createExecutionContext();
    const res = await app.request("/api/auth/logout", { method: "POST" }, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });
});
