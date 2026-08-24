import {
  Mutation,
  MutationCache,
  QueryClient,
  QueryClientProvider,
  type MutationFunctionContext,
} from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
// import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createIsomorphicFn } from "@tanstack/react-start";

import { toastManager } from "./components/ui/Toaster";
import { getApiErrorMessage } from "./lib/api";
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
      description: getApiErrorMessage(error),
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

  // SPA mode has no server-rendered query cache to dehydrate/hydrate, so
  // this skips @tanstack/react-router-ssr-query's full integration and
  // just wraps the router with a plain QueryClientProvider — without it,
  // any react-query hook (e.g. Header's useMutation) throws "No
  // QueryClient set", including during the build-time shell prerender.
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    context: { queryClient },
    Wrap: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });

  // setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
