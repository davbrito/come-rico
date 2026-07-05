import { createServerFn } from "@tanstack/react-start";

import { getCurrentUser } from "#/api";
import type { CurrentUserDto } from "#/api/types.gen";

/**
 * Reads the current session on the Start server (the BFF): forwards the
 * incoming auth cookie to the .NET backend and returns the user, or null.
 *
 * Because this runs in `beforeLoad`, both SSR and client-side navigations
 * see the same auth state — the session never "disappears" on reload.
 */
export const fetchCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<CurrentUserDto | null> => {
    const res = await getCurrentUser({ throwOnError: false });
    if (res.response?.status === 401) return null;
    if (!res.data) throw new Error("Failed to fetch current user");
    return res.data;
  },
);
