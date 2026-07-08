import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

async function request(path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await app.request(path, init, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("roulette hub upgrade gating", () => {
  it("rejects a non-WebSocket request with 426", async () => {
    const res = await request("/hubs/roulette");
    expect(res.status).toBe(426);
  });

  it("rejects an unauthenticated upgrade with 401", async () => {
    const res = await request("/hubs/roulette", { headers: { upgrade: "websocket" } });
    expect(res.status).toBe(401);
  });
});
