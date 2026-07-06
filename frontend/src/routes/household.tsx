import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { Check, Pencil, RefreshCw, X } from "lucide-react";
import { useState } from "react";

import {
  createHouseholdMutation,
  getHouseholdMembersOptions,
  joinHouseholdMutation,
  leaveHouseholdMutation,
  renameHouseholdMutation,
  rotateInviteCodeMutation,
} from "#/api/@tanstack/react-query.gen";
import { Button } from "#/components/ui/Button";
import { Input } from "#/components/ui/Input";
import { getApiErrorMessage } from "#/lib/api";

export const Route = createFileRoute("/household")({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: "/login" });
    return { user: context.user };
  },
  loader: async ({ context }) => {
    if (context.user.householdId) {
      await context.queryClient.ensureQueryData(getHouseholdMembersOptions());
    }
  },
  component: HouseholdPage,
});

function HouseholdPage() {
  const { user } = Route.useRouteContext();

  return (
    <main className="page-wrap px-4 pt-10 pb-8">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-center text-2xl font-bold text-sea-ink">🏠 Tu hogar</h1>
        {user.householdId ? <HouseholdDetails user={user} /> : <HouseholdOnboard />}
      </div>
    </main>
  );
}

function HouseholdOnboard() {
  const router = useRouter();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

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

  return (
    <>
      <p className="mb-6 text-center text-sm text-sea-ink-soft">
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
    </>
  );
}

function HouseholdDetails({
  user,
}: {
  user: NonNullable<ReturnType<typeof Route.useRouteContext>["user"]>;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const { data: members } = useSuspenseQuery(getHouseholdMembersOptions());
  const [copied, setCopied] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const isAdmin = user.role === "Admin";
  const [editing, setEditing] = useState(false);
  const [editedName, setEditedName] = useState(user.householdName ?? "");

  const [optimisticName, setOptimisticName] = useState<string | null>(null);
  const displayName = optimisticName ?? user.householdName;

  const renameMut = useMutation({
    ...renameHouseholdMutation(),
    onMutate: async ({ body }) => {
      setOptimisticName(body.name);
      setEditing(false);
    },
    onError: () => {
      setOptimisticName(null);
      setEditing(true);
    },
    onSettled: async () => {
      await router.invalidate();
      setOptimisticName(null);
    },
  });

  const rotateCodeMut = useMutation({
    ...rotateInviteCodeMutation(),
    onSuccess: async () => {
      await router.invalidate();
    },
  });

  const leaveMut = useMutation({
    ...leaveHouseholdMutation(),
    onSuccess: async () => {
      await router.invalidate();
      navigate({ to: "/household" });
    },
  });

  return (
    <>
      <div className="island-shell rounded-2xl p-6 text-center">
        <div className="relative flex items-center justify-center gap-2 border-b border-chip-line p-2">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = editedName.trim();
                if (name && name !== user.householdName) {
                  renameMut.mutate({ body: { name: name } });
                }
              }}
              className="contents"
            >
              <input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="w-full bg-transparent text-center text-lg font-semibold text-sea-ink underline-offset-4 outline-none focus:underline"
                autoFocus
                required
              />
              <div className="absolute top-1/2 right-0 flex -translate-y-1/2 gap-1.5">
                <Button type="submit" size="icon-sm" disabled={renameMut.isPending}>
                  {renameMut.isPending ? "…" : <Check className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setEditing(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </form>
          ) : (
            <>
              <p className="w-full text-lg font-semibold text-sea-ink">{displayName}</p>
              {isAdmin && (
                <Button
                  className="absolute top-1/2 right-0 -translate-y-1/2"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setEditedName(user.householdName ?? "");
                    setEditing(true);
                  }}
                  title="Editar nombre"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>

        <p className="mt-1 text-xs text-sea-ink-soft">
          Tu rol: {isAdmin ? "Administrador" : "Miembro"}
        </p>
        {user.inviteCode && (
          <div className="mt-5">
            <p className="text-xs font-semibold tracking-widest text-orange-500 uppercase">
              Código de invitación
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard?.writeText(user.inviteCode!).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
                className="flex-1 rounded-xl border-dashed border-line px-6 py-3 font-mono text-xl font-bold tracking-[0.3em]"
                title="Copiar código"
              >
                {user.inviteCode}
              </Button>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => rotateCodeMut.mutate({})}
                  disabled={rotateCodeMut.isPending}
                  title="Rotar código"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${rotateCodeMut.isPending ? "animate-spin" : ""}`}
                  />
                </Button>
              )}
            </div>
            <p className="mt-2 text-xs text-sea-ink-soft">
              {copied
                ? "¡Copiado!"
                : isAdmin
                  ? "Compártelo con tu familia. Toca para copiar o rota el código."
                  : "Compártelo con tu familia para que se unan. Toca para copiar."}
            </p>
          </div>
        )}
      </div>

      <div className="island-shell mt-4 rounded-2xl p-6">
        <h2 className="mb-3 text-base font-semibold text-sea-ink">Miembros ({members.length})</h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-xl bg-[var(--card-bg)] px-4 py-2.5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--sea-ink)]/10 text-sm font-bold text-[var(--sea-ink)]">
                  {m.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-[var(--sea-ink)]">{m.displayName}</p>
                  <p className="text-xs text-[var(--sea-ink-soft)]">
                    {m.role === "Admin" ? "Administrador" : "Miembro"}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="island-shell mt-4 rounded-2xl border border-red-200 p-6 dark:border-red-900/40">
        {leaveMut.isError && (
          <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {getApiErrorMessage(leaveMut.error)}
          </p>
        )}

        {confirmingLeave ? (
          <div className="space-y-3">
            <p className="text-sm text-sea-ink-soft">
              {isAdmin && members.length > 1
                ? "Otro miembro será ascendido a administrador si no hay ninguno más. ¿Seguro que quieres abandonar el hogar?"
                : "¿Seguro que quieres abandonar el hogar?"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                disabled={leaveMut.isPending}
                onClick={() => leaveMut.mutate({})}
                className="flex-1"
              >
                {leaveMut.isPending ? "Saliendo…" : "Abandonar hogar"}
              </Button>
              <Button variant="outline" type="button" onClick={() => setConfirmingLeave(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmingLeave(true)} className="w-full">
            Abandonar hogar
          </Button>
        )}
      </div>
    </>
  );
}
