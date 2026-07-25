import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

async function status(path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await app.request(path, init, env, ctx);
  await waitOnExecutionContext(ctx);
  return res.status;
}

describe("image routes wiring", () => {
  it("guards POST /api/images", async () =>
    expect(
      await status("/api/images", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "image", keyFolder: "dishes", contentType: "image/png", sizeBytes: 1 }),
      }),
    ).toBe(401));

  it("guards PUT /api/images/:id", async () =>
    expect(await status("/api/images/abc", { method: "PUT" })).toBe(401));
});
