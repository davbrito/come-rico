import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_household")({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: "/login" });
    if (!context.user.householdId) throw redirect({ to: "/household" });
  },
});
