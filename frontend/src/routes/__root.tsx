import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { Toaster } from "#/components/ui/Toaster";
import { getInitialThemeMode } from "#/lib/theme";

import Header from "../components/Header";
import { fetchCurrentUser } from "../server/auth";

import appCss from "../styles.css?url";

// The server can't know the client's OS color-scheme preference, so "auto"
// falls back to "light" for the initial SSR paint; this script corrects it
// (and keeps light/dark accurate) before the page is visible.
const THEME_INIT_SCRIPT = `(function(){try{var match=document.cookie.match(/(?:^|; )theme=([^;]*)/);var stored=match?decodeURIComponent(match[1]):undefined;var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // The session is read server-side and flows into the router context, so
  // SSR, reloads, and client navigations all agree on who is logged in.
  beforeLoad: async () => {
    const user = await fetchCurrentUser();
    return { user };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ComeRico — ¿Qué vamos a comer?" },
      {
        name: "description",
        content:
          "Organiza los platillos de tu hogar, gira la ruleta para decidir qué comer y genera tu lista de compras automáticamente.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  errorComponent: RootErrorComponent,
  shellComponent: RootDocument,
});

function RootErrorComponent({ error }: ErrorComponentProps) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Algo salió mal</h1>
      <p className="text-muted-foreground text-sm">
        {error instanceof Error ? error.message : "Ocurrió un error inesperado."}
      </p>
    </div>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const mode = getInitialThemeMode();
  const resolved = mode === "auto" ? "light" : mode;

  return (
    <html
      lang="es"
      className={resolved}
      data-theme={mode === "auto" ? undefined : mode}
      style={{ colorScheme: resolved }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans wrap-anywhere antialiased selection:bg-[rgba(79,184,178,0.24)]">
        <div id="app" className="isolate">
          <Header />
          {children}
        </div>
        <Toaster />
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[
            { name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> },
            { name: "React Query", render: <ReactQueryDevtoolsPanel /> },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
