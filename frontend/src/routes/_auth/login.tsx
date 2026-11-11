import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { Button } from "#/components/ui/Button";
import { loginUrl } from "#/server/auth";

// `error` is set by the backend when it sends the browser back here after a failed sign-in.
const searchSchema = z.object({ error: z.string().optional() });

export const Route = createFileRoute("/_auth/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

const ERROR_MESSAGES: Record<string, string> = {
  email_not_verified: "Verifica tu correo electrónico antes de entrar.",
  email_in_use:
    "Ese correo ya pertenece a otra cuenta. Entra con la cuenta con la que te registraste.",
};
const DEFAULT_ERROR = "No pudimos iniciar tu sesión. Inténtalo de nuevo.";

function LoginPage() {
  const { error } = Route.useSearch();
  const [redirecting, setRedirecting] = useState(false);

  return (
    <>
      <h1 className="mb-6 text-center text-2xl font-bold text-sea-ink">👋 Inicia sesión</h1>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400"
        >
          {ERROR_MESSAGES[error] ?? DEFAULT_ERROR}
        </p>
      )}

      <div className="island-shell space-y-4 rounded-2xl p-6">
        <Button
          className="w-full"
          disabled={redirecting}
          onClick={() => {
            setRedirecting(true);
            window.location.assign(loginUrl());
          }}
        >
          {redirecting ? "Un momento…" : "Entrar"}
        </Button>
        <p className="text-center text-sm text-sea-ink-soft">
          El acceso es solo por invitación. Si recibiste una, usa el enlace del correo para crear tu
          cuenta.
        </p>
      </div>
    </>
  );
}
