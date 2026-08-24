import { getCurrentUser } from "#/api";
import type { CurrentUserDto } from "#/api/types.gen";

/**
 * Reads the current session: forwards the auth cookie (or, client-side,
 * relies on the browser sending it via CORS credentials) to the .NET
 * backend and returns the user, or null.
 *
 * Runs in the root route's `beforeLoad` — including once at build time
 * against no real backend/cookie, to prerender the SPA shell (see
 * vite.config.ts's `spa: { enabled: true }`) — so any failure (network
 * error, non-401 response) degrades to "logged out" instead of throwing.
 * A hard failure here would crash the shell/every navigation instead of
 * just rendering the logged-out UI.
 */
export const fetchCurrentUser = async (): Promise<CurrentUserDto | null> => {
  const res = await getCurrentUser({ throwOnError: false });
  if (res.data) return res.data;
  if (res.status !== 401) {
    console.error("Failed to fetch current user:", res.response?.status ?? res.error);
  }
  return null;
};
