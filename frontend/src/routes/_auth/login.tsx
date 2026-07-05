import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { postApiAuthLoginMutation } from "#/api/@tanstack/react-query.gen";
import { LoginInput } from "#/components/auth/LoginInput";
import { getApiErrorMessage } from "#/lib/api";

export const Route = createFileRoute("/_auth/login")({
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const navigate = Route.useNavigate();
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });

  const loginMut = useMutation({
    ...postApiAuthLoginMutation(),
    async onSuccess() {
      await router.invalidate();
      navigate({ to: "/" });
    },
  });
  const busy = loginMut.isPending;
  const error = loginMut.error ? getApiErrorMessage(loginMut.error) : null;

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    await loginMut.mutateAsync({ body: { email: form.email, password: form.password } });
  };

  return (
    <main className="page-wrap px-4 pt-10 pb-8">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-center text-2xl font-bold text-[var(--sea-ink)]">
          {"👋 Inicia sesión"}
        </h1>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="island-shell rounded-2xl p-6">
          <div className="space-y-3">
            <LoginInput
              required
              type="email"
              autoComplete="email"
              placeholder="Correo electrónico *"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <LoginInput
              required
              type="password"
              minLength={8}
              autoComplete="current-password"
              placeholder="Contraseña *"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
          >
            {busy ? "Un momento…" : "Entrar"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[var(--sea-ink-soft)]">
          ¿No tienes cuenta?{" "}
          <button
            type="button"
            onClick={() => {
              navigate({ to: "/register" });
            }}
            className="font-semibold text-orange-500 hover:underline"
          >
            Regístrate
          </button>
        </p>
      </div>
    </main>
  );
}
