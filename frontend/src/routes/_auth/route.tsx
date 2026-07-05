import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
  beforeLoad: ({ context }) => {
    if (context.user) {
      throw redirect({ to: context.user.householdId ? "/" : "/household" });
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
