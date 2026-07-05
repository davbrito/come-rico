import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { z } from "zod";

import { registerMutation } from "#/api/@tanstack/react-query.gen";
import { useAppForm } from "#/components/form";
import { Button } from "#/components/ui/Button";
import { getApiErrorMessage } from "#/lib/api";

export const Route = createFileRoute("/_auth/register")({
  component: LoginPage,
});

const displayNameSchema = z.string().trim().min(1, "Requerido");
const emailSchema = z.email("Correo electrónico inválido");
const passwordSchema = z.string().min(8, "Mínimo 8 caracteres");

function LoginPage() {
  const router = useRouter();
  const navigate = Route.useNavigate();

  const registerMut = useMutation({
    ...registerMutation(),
    async onSuccess() {
      await router.invalidate();
      navigate({ to: "/" });
    },
  });

  const errorMessage = registerMut.error ? getApiErrorMessage(registerMut.error) : null;

  const form = useAppForm({
    defaultValues: { displayName: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      await registerMut.mutateAsync({ body: value });
    },
  });

  return (
    <>
      <h1 className="mb-6 text-center text-2xl font-bold text-[var(--sea-ink)]">
        {"✨ Crea tu cuenta"}
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
        className="island-shell rounded-2xl p-6"
      >
        <div className="space-y-3">
          <form.AppField name="displayName" validators={{ onChange: displayNameSchema }}>
            {(field) => <field.TextField label="Tu nombre *" required />}
          </form.AppField>
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
          <form.AppField name="password" validators={{ onChange: passwordSchema }}>
            {(field) => (
              <field.TextField
                label="Contraseña *"
                type="password"
                autoComplete="new-password"
                required
              />
            )}
          </form.AppField>
        </div>

        <form.AppForm>
          <form.SubmitButton pendingLabel="Un momento…" className="mt-5 w-full px-5 py-2.5">
            Registrarme
          </form.SubmitButton>
        </form.AppForm>
      </form>

      <p className="mt-4 text-center text-sm text-[var(--sea-ink-soft)]">
        {"¿Ya tienes cuenta?"}{" "}
        <Button
          variant="ghost"
          onClick={() => {
            navigate({ to: "/login" });
          }}
          className="hover:underline"
        >
          Inicia sesión
        </Button>
      </p>
    </>
  );
}
