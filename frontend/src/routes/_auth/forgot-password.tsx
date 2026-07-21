import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import axios from "axios";
import { z } from "zod";

import { useAppForm } from "#/components/form";
import { Button } from "#/components/ui/Button";
import { getApiErrorMessage } from "#/lib/api";

export const Route = createFileRoute("/_auth/forgot-password")({
  component: ForgotPasswordPage,
});

const emailSchema = z.email("Correo electrónico inválido");

function ForgotPasswordPage() {
  const navigate = Route.useNavigate();

  const forgotMut = useMutation({
    mutationFn: (email: string) => axios.post("/api/auth/forgot-password", { email }),
  });

  const errorMessage = forgotMut.error ? getApiErrorMessage(forgotMut.error) : null;

  const form = useAppForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      await forgotMut.mutateAsync(value.email);
    },
  });

  if (forgotMut.isSuccess) {
    return (
      <>
        <h1 className="mb-6 text-center text-2xl font-bold text-sea-ink">📬 Revisa tu correo</h1>
        <div className="island-shell space-y-4 rounded-2xl p-6 text-center text-sm text-sea-ink-soft">
          <p>
            Si existe una cuenta con ese correo, te enviaremos instrucciones para restablecer tu
            contraseña.
          </p>
          <Button variant="link" onClick={() => navigate({ to: "/login" })}>
            Volver a inicio de sesión
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-6 text-center text-2xl font-bold text-sea-ink">🔑 ¿Olvidaste tu contraseña?</h1>

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
        <p className="text-sm text-sea-ink-soft">
          Ingresa tu correo electrónico y te enviaremos instrucciones para restablecer tu
          contraseña.
        </p>

        <form.AppField name="email" validators={{ onChange: emailSchema }}>
          {(field) => (
            <field.TextField
              label="Correo electrónico *"
              type="email"
              autoComplete="email"
              required
            />
          )}
        </form.AppField>

        <form.AppForm>
          <form.SubmitButton pendingLabel="Enviando…" className="w-full">
            Enviar instrucciones
          </form.SubmitButton>
        </form.AppForm>
      </form>

      <p className="mt-4 text-center text-sm text-sea-ink-soft">
        <Button variant="link" onClick={() => navigate({ to: "/login" })}>
          Volver a inicio de sesión
        </Button>
      </p>
    </>
  );
}
