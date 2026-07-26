/**
 * Cloudflare Workers entry point.
 *
 * `main` in the wrangler config points here (see wrangler.jsonc), and
 * Terraform uploads the built version of this module as the Worker script
 * (infra/cloudflare.tf).
 *
 * - `fetch` is TanStack Start's server handler: SSR routes plus the server
 *   routes under src/routes, including the /api/** proxy in api.$.ts.
 * - `scheduled` runs the cron jobs. Both cron triggers land here and are
 *   dispatched on the cron expression, which is supplied as a binding so
 *   changing a schedule in Terraform can't silently unwire a job.
 */
import handler from "@tanstack/react-start/server-entry";

interface CronEnv {
  BACKEND_URL?: string;
  CRON_SECRET?: string;
  IMAGE_CLEANUP_CRON?: string;
  KEEP_WARM_CRON?: string;
}

/**
 * Weekly orphaned-file GC. The endpoint authenticates on the bearer secret
 * rather than a user cookie and runs cross-tenant.
 */
async function imageCleanup(env: CronEnv): Promise<void> {
  if (!env.BACKEND_URL || !env.CRON_SECRET) {
    console.error("image-cleanup: BACKEND_URL or CRON_SECRET is not set");
    return;
  }

  const response = await fetch(new URL("/api/images/cleanup", env.BACKEND_URL), {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });

  if (!response.ok) {
    console.error(`image-cleanup: ${response.status} ${response.statusText}`);
    return;
  }

  console.log(`image-cleanup: ok — ${await response.text()}`);
}

/**
 * Azure App Service F1 has no "Always On" and unloads the app after ~20
 * minutes idle, costing the next visitor a 20-40s cold start. A cheap
 * request keeps it resident for a negligible slice of the 60 CPU-min/day
 * free-tier budget.
 */
async function keepWarm(env: CronEnv): Promise<void> {
  if (!env.BACKEND_URL) {
    console.error("keep-warm: BACKEND_URL is not set");
    return;
  }

  try {
    const response = await fetch(new URL("/api/auth/me", env.BACKEND_URL));
    // 401 is expected when unauthenticated and still means the app is awake.
    if (response.status !== 200 && response.status !== 401) {
      console.error(`keep-warm: unexpected ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error("keep-warm: request failed", error);
  }
}

export default {
  fetch: handler.fetch,

  async scheduled(controller: { cron: string }, env: CronEnv, ctx: { waitUntil(p: Promise<unknown>): void }) {
    switch (controller.cron) {
      case env.IMAGE_CLEANUP_CRON:
        ctx.waitUntil(imageCleanup(env));
        break;
      case env.KEEP_WARM_CRON:
        ctx.waitUntil(keepWarm(env));
        break;
      default:
        console.error(`scheduled: no job registered for cron "${controller.cron}"`);
    }
  },
};
