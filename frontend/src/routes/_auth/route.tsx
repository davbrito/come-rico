import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { fetchCurrentUser } from "#/server/auth";

export const Route = createFileRoute("/_auth")({
  loader: async () => {
    const user = await fetchCurrentUser();
    if (user) {
      throw redirect({ to: user.householdId ? "/" : "/household" });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <main className="page-wrap px-4 pt-10 pb-8">
      <div className="mx-auto max-w-md">
        <Outlet />
      </div>
    </main>
  );
}
