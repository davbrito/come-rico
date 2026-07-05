import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { postApiIdentityLoginMutation } from "#/api/@tanstack/react-query.gen";
import { Button } from "#/components/ui/Button";
import { Input } from "#/components/ui/Input";
import { getApiErrorMessage } from "#/lib/api";

export const Route = createFileRoute("/_auth/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = Route.useNavigate();
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });

  const loginMut = useMutation({
    ...postApiIdentityLoginMutation(),
    async onSuccess() {
      await navigate({ to: "/" });
    },
  });
  const busy = loginMut.isPending;
  const error = loginMut.error ? getApiErrorMessage(loginMut.error) : null;

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    await loginMut.mutateAsync({
      body: { email: form.email, password: form.password },
      query: { useCookies: true },
    });
  };

  return (
    <>
      <h1 className="mb-6 text-center text-2xl font-bold text-sea-ink">{"👋 Inicia sesión"}</h1>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="island-shell rounded-2xl p-6">
        <div className="space-y-3">
          <Input
            required
            type="email"
            autoComplete="email"
            placeholder="Correo electrónico *"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Input
            required
            type="password"
            minLength={8}
            autoComplete="current-password"
            placeholder="Contraseña *"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </div>

        <Button type="submit" disabled={busy} className="mt-5 w-full px-5 py-2.5">
          {busy ? "Un momento…" : "Entrar"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-sea-ink-soft">
        ¿No tienes cuenta?{" "}
        <Button
          variant="ghost"
          onClick={() => {
            navigate({ to: "/register" });
          }}
          className="hover:underline"
        >
          Regístrate
        </Button>
      </p>
    </>
  );
}
