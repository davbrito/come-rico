import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/Button";
import { authUserOptions, signOut } from "#/server/auth";

import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const { data: user } = useQuery(authUserOptions());
  const [menuOpen, setMenuOpen] = useState(false);

  // signOut ends in a full-page navigation (to AuthKit's logout, then back to /login),
  // which also drops every cached query of the session that just ended.
  const logoutMut = useMutation({ mutationFn: signOut });

  return (
    <header className="sticky top-0 isolate z-50 border-b border-line bg-header-bg px-2 backdrop-blur-lg sm:px-4">
      <nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-2 sm:py-4">
        <h2 className="m-0 shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-chip-line bg-chip-bg px-3 py-1.5 text-sm text-sea-ink no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] sm:px-4 sm:py-2"
          >
            <img src="/favicon.svg" alt="" className="h-5 w-5" />
            ComeRico
          </Link>
        </h2>

        <Button
          variant="outline"
          size="icon-sm"
          className="sm:hidden"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={16} /> : <Menu size={16} />}
        </Button>

        {/* On mobile, picking a page closes the menu (it would otherwise cover the page). */}
        <div
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setMenuOpen(false);
          }}
          className={`${menuOpen ? "flex" : "hidden"} order-4 w-full flex-col items-start gap-2 pb-1 text-sm font-semibold sm:order-0 sm:flex sm:w-auto sm:flex-row sm:flex-nowrap sm:items-center sm:gap-x-4 sm:gap-y-1 sm:pb-0`}
        >
          <Link
            to="/"
            className="nav-link"
            activeOptions={{ exact: true }}
            activeProps={{ className: "nav-link is-active" }}
          >
            Inicio
          </Link>
          {user?.householdId && (
            <>
              <Link
                to="/dishes"
                className="nav-link"
                activeProps={{ className: "nav-link is-active" }}
              >
                Platillos
              </Link>
              <Link
                to="/meal-plan"
                className="nav-link"
                activeProps={{ className: "nav-link is-active" }}
              >
                Plan
              </Link>
              <Link
                to="/shopping"
                className="nav-link"
                activeProps={{ className: "nav-link is-active" }}
              >
                Compras
              </Link>
              <Link
                to="/products"
                className="nav-link"
                activeProps={{ className: "nav-link is-active" }}
              >
                Productos
              </Link>
            </>
          )}
          {user && (
            <>
              <Link
                to="/household"
                className="nav-link"
                activeProps={{ className: "nav-link is-active" }}
              >
                Hogar
              </Link>
              <Link
                to="/settings"
                className="nav-link"
                activeProps={{ className: "nav-link is-active" }}
              >
                Ajustes
              </Link>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {user ? (
            <>
              <span className="hidden text-sm font-medium text-sea-ink-soft sm:inline">
                {user.displayName}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => logoutMut.mutate()}
                disabled={logoutMut.isPending || logoutMut.isSuccess}
              >
                Salir
              </Button>
            </>
          ) : (
            <Button size="sm" nativeButton={false} render={<Link to="/login" />}>
              Entrar
            </Button>
          )}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
