import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

async function status(path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await app.request(path, init, env, ctx);
  await waitOnExecutionContext(ctx);
  return res.status;
}

// No-DB wiring checks: household-scoped routes reject requests without a
// household session (401) before touching the database.
describe("dishes/tags routes wiring", () => {
  it("guards GET /api/dishes", async () => expect(await status("/api/dishes")).toBe(401));
  it("guards POST /api/dishes", async () =>
    expect(
      await status("/api/dishes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      }),
    ).toBe(401));
  it("guards GET /api/tags", async () => expect(await status("/api/tags")).toBe(401));
});
