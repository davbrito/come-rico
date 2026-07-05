import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { createHouseholdMutation, joinHouseholdMutation } from "#/api/@tanstack/react-query.gen";
import { Button } from "#/components/ui/Button";
import { Input } from "#/components/ui/Input";
import { getApiErrorMessage } from "#/lib/api";

export const Route = createFileRoute("/household")({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: "/login" });
    return { user: context.user };
  },
  component: HouseholdPage,
});

function HouseholdPage() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [copied, setCopied] = useState(false);

  const createMut = useMutation({
    ...createHouseholdMutation(),
    onSuccess: async () => {
      await router.invalidate();
      navigate({ to: "/" });
    },
  });

  const joinMut = useMutation({
    ...joinHouseholdMutation(),
    onSuccess: async () => {
      await router.invalidate();
      navigate({ to: "/" });
    },
  });

  const error = createMut.isError
    ? getApiErrorMessage(createMut.error)
    : joinMut.isError
      ? getApiErrorMessage(joinMut.error)
      : null;

  const busy = createMut.isPending || joinMut.isPending;

  // Already in a household: show its info + invite code
  if (user.householdId) {
    return (
      <main className="page-wrap px-4 pt-10 pb-8">
        <div className="mx-auto max-w-md">
          <h1 className="mb-6 text-center text-2xl font-bold text-[var(--sea-ink)]">🏠 Tu hogar</h1>
          <div className="island-shell rounded-2xl p-6 text-center">
            <p className="text-lg font-semibold text-[var(--sea-ink)]">{user.householdName}</p>
            <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
              Tu rol: {user.role === "Admin" ? "Administrador" : "Miembro"}
            </p>
            {user.inviteCode && (
              <div className="mt-5">
                <p className="text-xs font-semibold tracking-widest text-orange-500 uppercase">
                  Código de invitación
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(user.inviteCode!).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="mt-2 rounded-xl border-dashed border-[var(--line)] px-6 py-3 font-mono text-xl font-bold tracking-[0.3em]"
                  title="Copiar código"
                >
                  {user.inviteCode}
                </Button>
                <p className="mt-2 text-xs text-[var(--sea-ink-soft)]">
                  {copied
                    ? "¡Copiado!"
                    : "Compártelo con tu familia para que se unan. Toca para copiar."}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-wrap px-4 pt-10 pb-8">
      <div className="mx-auto max-w-md">
        <h1 className="mb-2 text-center text-2xl font-bold text-[var(--sea-ink)]">🏠 Tu hogar</h1>
        <p className="mb-6 text-center text-sm text-[var(--sea-ink-soft)]">
          Crea un hogar nuevo o únete a uno existente con un código de invitación.
        </p>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMut.mutate({ body: { name } });
          }}
          className="island-shell mb-4 rounded-2xl p-6"
        >
          <h2 className="mb-3 text-base font-semibold text-[var(--sea-ink)]">Crear un hogar</h2>
          <Input
            required
            placeholder="Nombre del hogar (ej. Los Brito Navas) *"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={busy} className="mt-4 w-full px-5 py-2.5">
            {createMut.isPending ? "Un momento…" : "Crear hogar"}
          </Button>
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            joinMut.mutate({ body: { inviteCode } });
          }}
          className="island-shell rounded-2xl p-6"
        >
          <h2 className="mb-3 text-base font-semibold text-[var(--sea-ink)]">Unirme a un hogar</h2>
          <Input
            required
            placeholder="Código de invitación *"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            className="font-mono tracking-widest uppercase"
          />
          <Button
            type="submit"
            variant="accent-outline"
            disabled={busy}
            className="mt-4 w-full px-5 py-2.5"
          >
            {joinMut.isPending ? "Un momento…" : "Unirme"}
          </Button>
        </form>
      </div>
    </main>
  );
}
