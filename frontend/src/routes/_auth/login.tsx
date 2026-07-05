import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import axios from "axios";
import { z } from "zod";

import { postApiIdentityLoginMutation } from "#/api/@tanstack/react-query.gen";
import { useAppForm } from "#/components/form";
import { Button } from "#/components/ui/Button";
import { getApiErrorMessage } from "#/lib/api";

export const Route = createFileRoute("/_auth/login")({
  component: LoginPage,
});

const emailSchema = z.email("Correo electrónico inválido");
const passwordSchema = z.string().min(8, "Mínimo 8 caracteres");

function LoginPage() {
  const navigate = Route.useNavigate();

  const loginMut = useMutation({
    ...postApiIdentityLoginMutation(),
    async onSuccess() {
      await navigate({ to: "/" });
    },
  });
  const error = loginMut.error
    ? loginMut.error.response?.status === 401
      ? "Credenciales inválidas"
      : getApiErrorMessage(loginMut.error)
    : null;

  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      await loginMut.mutateAsync({
        body: { email: value.email, password: value.password },
        query: { useCookies: true },
      });
    },
  });

  return (
    <>
      <h1 className="mb-6 text-center text-2xl font-bold text-sea-ink">{"👋 Inicia sesión"}</h1>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
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
        <div className="space-y-3">
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
                autoComplete="current-password"
                required
              />
            )}
          </form.AppField>
        </div>

        <form.AppForm>
          <form.SubmitButton pendingLabel="Un momento…" className="w-full">
            Entrar
          </form.SubmitButton>
        </form.AppForm>
      </form>

      <p className="mt-4 text-center text-sm text-sea-ink-soft">
        ¿No tienes cuenta?{" "}
        <Button
          variant="link"
          onClick={() => {
            navigate({ to: "/register" });
          }}
        >
          Regístrate
        </Button>
      </p>
    </>
  );
}
