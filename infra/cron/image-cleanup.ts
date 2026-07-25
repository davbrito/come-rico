/**
 * Weekly orphaned-file GC.
 *
 * Replaces the Vercel Cron entry that used to live in vercel.json. Calls
 * the backend through the Worker (same origin a browser would use); the
 * endpoint authenticates on the bearer secret, not a user cookie, and runs
 * cross-tenant with IgnoreQueryFilters.
 */
export default {
  async scheduled() {
    const appUrl = process.env.APP_URL;
    const cronSecret = process.env.CRON_SECRET;

    if (!appUrl || !cronSecret) {
      console.error("image-cleanup: APP_URL or CRON_SECRET is not set");
      return;
    }

    const response = await fetch(new URL("/api/images/cleanup", appUrl), {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });

    if (!response.ok) {
      console.error(`image-cleanup: ${response.status} ${response.statusText}`);
      return;
    }

    console.log(`image-cleanup: ok — ${await response.text()}`);
  },
};
