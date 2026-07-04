import { Link } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'

/**
 * Gate for household-scoped pages: prompts to log in when there is no session,
 * and to create/join a household when the user doesn't belong to one yet.
 */
export default function RequireHousehold({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <main className="page-wrap px-4 pb-8 pt-10">
        <p className="text-sm text-[var(--sea-ink-soft)]">Cargando…</p>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="page-wrap px-4 pb-8 pt-10">
        <div className="island-shell mx-auto max-w-md rounded-2xl p-8 text-center">
          <p className="text-4xl">🔒</p>
          <p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
            Inicia sesión para usar ComeRico.
          </p>
          <Link
            to="/login"
            className="mt-4 inline-block rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white no-underline transition hover:bg-orange-600"
          >
            Iniciar sesión
          </Link>
        </div>
      </main>
    )
  }

  if (!user.householdId) {
    return (
      <main className="page-wrap px-4 pb-8 pt-10">
        <div className="island-shell mx-auto max-w-md rounded-2xl p-8 text-center">
          <p className="text-4xl">🏠</p>
          <p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
            Necesitas crear o unirte a un hogar antes de continuar.
          </p>
          <Link
            to="/household"
            className="mt-4 inline-block rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white no-underline transition hover:bg-orange-600"
          >
            Configurar mi hogar
          </Link>
        </div>
      </main>
    )
  }

  return <>{children}</>
}
