import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import {
  deleteAccountMutation,
  postApiIdentityManageInfoMutation,
  updateProfileMutation,
} from "#/api/@tanstack/react-query.gen";
import { useAppForm } from "#/components/form";
import { Button } from "#/components/ui/Button";
import { Input } from "#/components/ui/Input";
import { getApiErrorMessage } from "#/lib/api";

export const Route = createFileRoute("/settings")({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: "/login" });
    return { user: context.user };
  },
  component: SettingsPage,
});

const displayNameSchema = z.string().trim().min(1, "Requerido");
const passwordSchema = z.string().min(8, "Mínimo 8 caracteres");

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const navigate = Route.useNavigate();

  return (
    <main className="page-wrap px-4 pt-10 pb-8">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="mb-2 text-center text-2xl font-bold text-[var(--sea-ink)]">
          ⚙️ Ajustes de la cuenta
        </h1>

        <ProfileSection displayName={user.displayName} onSaved={() => router.invalidate()} />
        <PasswordSection />
        <DangerZoneSection onDeleted={() => navigate({ to: "/login" })} />
      </div>
    </main>
  );
}

function ProfileSection({ displayName, onSaved }: { displayName: string; onSaved: () => void }) {
  const mut = useMutation({
    ...updateProfileMutation(),
    onSuccess: async () => {
      await onSaved();
    },
  });

  const form = useAppForm({
    defaultValues: { displayName },
    onSubmit: async ({ value }) => {
      await mut.mutateAsync({ body: { displayName: value.displayName.trim() } });
    },
  });

  const errorMessage = mut.isError ? getApiErrorMessage(mut.error) : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="island-shell rounded-2xl p-6"
    >
      <h2 className="mb-3 text-base font-semibold text-[var(--sea-ink)]">Perfil</h2>

      {errorMessage && (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {errorMessage}
        </p>
      )}
      {mut.isSuccess && !errorMessage && (
        <p className="mb-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
          Nombre actualizado.
        </p>
      )}

      <form.AppField name="displayName" validators={{ onChange: displayNameSchema }}>
        {(field) => <field.TextField label="Tu nombre *" required />}
      </form.AppField>

      <form.AppForm>
        <form.SubmitButton pendingLabel="Guardando…" className="mt-4 w-full px-5 py-2.5">
          Guardar nombre
        </form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

function PasswordSection() {
  const mut = useMutation({ ...postApiIdentityManageInfoMutation() });

  const form = useAppForm({
    defaultValues: { oldPassword: "", newPassword: "" },
    onSubmit: async ({ value }) => {
      await mut.mutateAsync({ body: value });
      form.reset();
    },
  });

  const errorMessage = mut.isError ? getApiErrorMessage(mut.error) : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="island-shell rounded-2xl p-6"
    >
      <h2 className="mb-3 text-base font-semibold text-[var(--sea-ink)]">Contraseña</h2>

      {errorMessage && (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {errorMessage}
        </p>
      )}
      {mut.isSuccess && !errorMessage && (
        <p className="mb-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
          Contraseña actualizada.
        </p>
      )}

      <div className="space-y-3">
        <form.AppField name="oldPassword" validators={{ onChange: passwordSchema }}>
          {(field) => (
            <field.PasswordField
              label="Contraseña actual *"
              autoComplete="current-password"
              required
            />
          )}
        </form.AppField>
        <form.AppField name="newPassword" validators={{ onChange: passwordSchema }}>
          {(field) => (
            <field.PasswordField label="Nueva contraseña *" autoComplete="new-password" required />
          )}
        </form.AppField>
      </div>

      <form.AppForm>
        <form.SubmitButton pendingLabel="Guardando…" className="mt-4 w-full px-5 py-2.5">
          Actualizar contraseña
        </form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

function DangerZoneSection({ onDeleted }: { onDeleted: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [confirming, setConfirming] = useState(false);

  const deleteMut = useMutation({
    ...deleteAccountMutation(),
    onSuccess: () => {
      onDeleted();
    },
  });

  const errorMessage = deleteMut.isError ? getApiErrorMessage(deleteMut.error) : null;

  return (
    <div className="island-shell rounded-2xl border border-red-200 p-6 dark:border-red-900/40">
      <h2 className="mb-1 text-base font-semibold text-red-500">Zona de peligro</h2>
      <p className="mb-3 text-xs text-[var(--sea-ink-soft)]">
        Eliminar tu cuenta es permanente y no se puede deshacer.
      </p>

      {errorMessage && (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {errorMessage}
        </p>
      )}

      {confirming ? (
        <div className="space-y-3">
          <p className="text-xs text-[var(--sea-ink-soft)]">
            Escribe <span className="font-semibold">ELIMINAR</span> para confirmar.
          </p>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus />
          <div className="flex gap-2">
            <Button
              variant="danger"
              disabled={confirmText !== "ELIMINAR" || deleteMut.isPending}
              onClick={() => deleteMut.mutate({})}
              className="flex-1"
            >
              {deleteMut.isPending ? "Eliminando…" : "Eliminar cuenta"}
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setConfirming(false);
                setConfirmText("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirming(true)} className="w-full">
          Eliminar mi cuenta
        </Button>
      )}
    </div>
  );
}
