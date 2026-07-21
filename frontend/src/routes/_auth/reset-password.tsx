import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { resetPasswordMutation } from "#/api/@tanstack/react-query.gen";
import { useAppForm } from "#/components/form";
import { Button } from "#/components/ui/Button";
import { getApiErrorMessage } from "#/lib/api";

const searchSchema = z.object({
  email: z.string().catch(""),
  token: z.string().catch(""),
});

export const Route = createFileRoute("/_auth/reset-password")({
  validateSearch: searchSchema,
  component: ResetPasswordPage,
});

const passwordSchema = z.string().min(8, "Mínimo 8 caracteres");

function ResetPasswordPage() {
  const { email, token } = Route.useSearch();
  const navigate = Route.useNavigate();

  const resetMut = useMutation(resetPasswordMutation());

  const errorMessage = resetMut.error ? getApiErrorMessage(resetMut.error) : null;

  const form = useAppForm({
    defaultValues: { password: "", confirmPassword: "" },
    onSubmit: async ({ value }) => {
      await resetMut.mutateAsync({ body: { email, token, newPassword: value.password } });
    },
  });

  if (!email || !token) {
    return (
      <>
        <h1 className="mb-6 text-center text-2xl font-bold text-sea-ink">Enlace inválido</h1>
        <div className="island-shell space-y-4 rounded-2xl p-6 text-center text-sm text-sea-ink-soft">
          <p>Este enlace de restablecimiento de contraseña no es válido o está incompleto.</p>
          <Button variant="link" onClick={() => navigate({ to: "/forgot-password" })}>
            Solicitar un nuevo enlace
          </Button>
        </div>
      </>
    );
  }

  if (resetMut.isSuccess) {
    return (
      <>
        <h1 className="mb-6 text-center text-2xl font-bold text-sea-ink">
          ✅ Contraseña actualizada
        </h1>
        <div className="island-shell space-y-4 rounded-2xl p-6 text-center text-sm text-sea-ink-soft">
          <p>Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión.</p>
          <Button variant="link" onClick={() => navigate({ to: "/login" })}>
            Ir a inicio de sesión
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-6 text-center text-2xl font-bold text-sea-ink">
        🔒 Restablece tu contraseña
      </h1>

      {errorMessage && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {errorMessage}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="island-shell space-y-5 rounded-2xl p-6"
      >
        <form.AppField name="password" validators={{ onChange: passwordSchema }}>
          {(field) => (
            <field.PasswordField label="Nueva contraseña *" autoComplete="new-password" required />
          )}
        </form.AppField>
        <form.AppField
          name="confirmPassword"
          validators={{
            onChangeListenTo: ["password"],
            onChange: ({ value, fieldApi }) =>
              value !== fieldApi.form.getFieldValue("password")
                ? "Las contraseñas no coinciden"
                : undefined,
          }}
        >
          {(field) => (
            <field.PasswordField
              label="Repite la contraseña *"
              autoComplete="new-password"
              required
            />
          )}
        </form.AppField>

        <form.AppForm>
          <form.SubmitButton pendingLabel="Guardando…" className="w-full">
            Restablecer contraseña
          </form.SubmitButton>
        </form.AppForm>
      </form>
    </>
  );
}
