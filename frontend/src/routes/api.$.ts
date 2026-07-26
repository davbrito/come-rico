import { createFileRoute } from "@tanstack/react-router";

/**
 * Catch-all reverse proxy for `/api/**` → the .NET backend.
 *
 * This is what keeps the app single-origin in production: the browser only
 * ever talks to the Worker, so the `__Host-` auth cookie needs no CORS and
 * no `SameSite=None`. It also makes `BACKEND_URL` the single source of
 * truth for the backend's location — the same variable `#/lib/api.ts` uses
 * for its server-side calls — so there's no second place to keep in sync.
 *
 * In dev this route is bypassed: Nitro's `devProxy` (see vite.config.ts)
 * handles `/api/**` before the route tree is consulted.
 */

const HOP_BY_HOP = ["host", "connection", "keep-alive", "transfer-encoding", "upgrade"];

/**
 * On Workers, SST's `environment` values arrive as bindings on the
 * `cloudflare:workers` env rather than `process.env`. Fall back to
 * `process.env` so the same code path works under `vite dev` and in tests,
 * where that module isn't available.
 */
async function resolveBackendUrl(): Promise<string | undefined> {
  try {
    const { env } = await import("cloudflare:workers");
    const fromBinding = (env as Record<string, unknown>)?.BACKEND_URL;
    if (typeof fromBinding === "string" && fromBinding) return fromBinding;
  } catch {
    // Not running on Workers — fall through to process.env.
  }
  return process.env.BACKEND_URL;
}

async function proxy({ request }: { request: Request }): Promise<Response> {
  const backendUrl = await resolveBackendUrl();
  if (!backendUrl) {
    return new Response(JSON.stringify({ message: "BACKEND_URL is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, backendUrl);

  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP) headers.delete(header);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    // Required when streaming a request body rather than buffering it.
    ...(hasBody ? { duplex: "half" } : {}),
    // Let the browser see the backend's 3xx rather than following it here.
    redirect: "manual",
  } as RequestInit);

  const responseHeaders = new Headers(upstream.headers);
  // fetch may have already decoded the body; re-advertising the original
  // encoding/length would make the browser try to decode it a second time.
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
      PUT: proxy,
      PATCH: proxy,
      DELETE: proxy,
      OPTIONS: proxy,
      HEAD: proxy,
    },
  },
});
