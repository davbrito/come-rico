import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { fetchCurrentUser } from "#/server/auth";

export const Route = createFileRoute("/_private")({
  beforeLoad: async () => {
    const user = await fetchCurrentUser();
    if (!user) throw redirect({ to: "/login" });
    return { user: user };
  },
  component: PrivateRoute,
});

function PrivateRoute() {
  return <Outlet />;
}
