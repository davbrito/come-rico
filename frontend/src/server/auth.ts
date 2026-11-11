import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

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
      throw new Error(`Failed to fetch current user: ${error.message || error}`);
    }
    console.error("response:", res);
    throw new Error("Failed to fetch current user: no data or error returned");
  }
  return res.data;
};

export const authUserOptions = () =>
  queryOptions({
    queryKey: ["auth-user"],
    queryFn: () => fetchCurrentUser(),
  });

/**
 * After anything that changes the session (login, register, household created/joined/left, profile or
 * household settings saved): re-reads the user into the "auth-user" cache, then re-runs the route guards.
 * `router.invalidate()` alone isn't enough: `/_private` reads the user with `staleTime: "static"`, so it
 * would keep the stale one (the header would still say "Entrar", the menu would miss the household pages).
 *
 * If the user or their household changed, every other cached query is dropped: dishes, products, the
 * shopping list… are household data, and keeping them would show the previous household's until stale.
 */
export function useRefreshSession() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return async () => {
    const key = authUserOptions().queryKey;
    const previous = queryClient.getQueryData<CurrentUserDto | null>(key);
    const user = await fetchCurrentUser();
    if (previous?.id !== user?.id || previous?.householdId !== user?.householdId) {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== key[0] });
    }
    queryClient.setQueryData(key, user);
    await router.invalidate();
  };
}

/** On logout / account deletion: drops every cached query (they belong to that user's household). */
export function useClearSession() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.removeQueries();
    queryClient.setQueryData(authUserOptions().queryKey, null);
  };
}
