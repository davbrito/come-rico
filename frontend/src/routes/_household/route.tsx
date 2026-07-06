import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_household")({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: "/login" });
    if (!context.user.householdId) throw redirect({ to: "/household" });

    return { user: context.user };
  },
  pendingComponent: PendingHousehold,
});

function PendingHousehold() {
  return (
    <main className="page-wrap px-4 pt-10 pb-8">
      <p className="text-sm text-sea-ink-soft">Cargando…</p>
    </main>
  );
}
