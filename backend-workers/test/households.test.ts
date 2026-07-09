import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

async function request(path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await app.request(path, init, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

// No-DB wiring checks: unauthenticated requests are rejected before any query.
describe("household routes wiring", () => {
  it("rejects create without a session", async () => {
    const res = await request("/api/households", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Casa" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects members listing without a session", async () => {
    const res = await request("/api/households/members");
    expect(res.status).toBe(401);
  });

  it("rejects leave without a session", async () => {
    const res = await request("/api/households/leave", { method: "POST" });
    expect(res.status).toBe(401);
  });
});
