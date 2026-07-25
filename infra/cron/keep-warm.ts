/**
 * Keeps the Azure App Service F1 instance warm.
 *
 * F1 has no "Always On" and unloads the app after ~20 minutes idle, which
 * costs the next visitor a ~20-40s cold start. A cheap request every 5
 * minutes avoids that; it uses a negligible slice of the 60 CPU-min/day
 * free-tier budget.
 *
 * Hits the backend directly (not through the Worker) so this measures and
 * warms the thing that actually sleeps. /api/auth/me returns 401 when
 * unauthenticated, which is a perfectly good "the app is up" signal.
 */
export default {
  async scheduled() {
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      console.error("keep-warm: BACKEND_URL is not set");
      return;
    }

    try {
      const response = await fetch(new URL("/api/auth/me", backendUrl));
      // 401 is expected and means the app is awake.
      if (response.status !== 200 && response.status !== 401) {
        console.error(`keep-warm: unexpected ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error("keep-warm: request failed", error);
    }
  },
};
