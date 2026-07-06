import { getCurrentUser } from "#/api";
import type { CurrentUserDto } from "#/api/types.gen";

/**
 * Reads the current session on the Start server (the BFF): forwards the
 * incoming auth cookie to the .NET backend and returns the user, or null.
 *
 * Because this runs in `beforeLoad`, both SSR and client-side navigations
 * see the same auth state — the session never "disappears" on reload.
 */
export const fetchCurrentUser = async (): Promise<CurrentUserDto | null> => {
  const res = await getCurrentUser({ throwOnError: false });
  if (res.status === 401) return null;
  if (!res.data) {
    if (res.response) {
      console.error("Failed to fetch current user:", res.response.status, res.response.statusText);
    }
    if (res.error) {
      const error = res.error as any;
      console.error("Failed to fetch current user:", error);
      throw new Error(`Failed to fetch current user: ${error.message}`);
    }
    console.error("response:", res);
    throw new Error("Failed to fetch current user: no data or error returned");
  }
  return res.data;
};
