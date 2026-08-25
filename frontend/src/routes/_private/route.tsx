import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { authUserOptions } from "#/server/auth";

export const Route = createFileRoute("/_private")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.query({ ...authUserOptions(), staleTime: "static" });
    if (!user) throw redirect({ to: "/login" });
    return { user: user };
  },
  component: PrivateRoute,
});

function PrivateRoute() {
  return <Outlet />;
}
