import "#/lib/api";
import {
  Mutation,
  MutationCache,
  QueryClient,
  type MutationFunctionContext,
} from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createIsomorphicFn } from "@tanstack/react-start";

import { toastManager } from "./components/ui/Toaster";
import { routeTree } from "./routeTree.gen";

const onMutationError = createIsomorphicFn()
  .server(
    (
      error: Error,
      _variables: unknown,
      _onMutateResult: unknown,
      _mutation: Mutation<unknown, unknown, unknown>,
      _context: MutationFunctionContext,
    ) => {
      console.error(error.message);
    },
  )
  .client((error) => {
    toastManager.add({
      type: "error",
      title: "Error",
      description: error instanceof Error ? error.message : "Ocurrió un error inesperado",
    });
  });

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
      },
    },
    mutationCache: new MutationCache({
      onError: onMutationError,
    }),
  });

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    context: { queryClient },
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
