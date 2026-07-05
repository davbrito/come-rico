import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { registerMutation } from "#/api/@tanstack/react-query.gen";
import { Button } from "#/components/ui/Button";
import { Input } from "#/components/ui/Input";
import { getApiErrorMessage } from "#/lib/api";

export const Route = createFileRoute("/_auth/register")({
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const navigate = Route.useNavigate();
  const mode = "register";
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });

  const registerMut = useMutation({
    ...registerMutation(),
    async onSuccess() {
      await router.invalidate();
      navigate({ to: "/" });
    },
  });

  const busy = registerMut.isPending;
  const errorMessage = registerMut.error ? getApiErrorMessage(registerMut.error) : null;

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    await registerMut.mutateAsync({ body: form });
  };

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

      <form onSubmit={handleSubmit} className="island-shell rounded-2xl p-6">
        <div className="space-y-3">
          {mode === "register" && (
            <Input
              required
              placeholder="Tu nombre *"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          )}
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
            autoComplete="new-password"
            placeholder="Contraseña *"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </div>

        <Button type="submit" disabled={busy} className="mt-5 w-full px-5 py-2.5">
          {busy ? "Un momento…" : "Registrarme"}
        </Button>
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
