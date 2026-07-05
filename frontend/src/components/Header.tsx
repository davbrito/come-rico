import { Link, useNavigate, useRouteContext, useRouter } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import ThemeToggle from './ThemeToggle'
import { logoutMutation } from '#/api/@tanstack/react-query.gen'

export default function Header() {
  const { user } = useRouteContext({ from: '__root__' })
  const router = useRouter()
  const navigate = useNavigate()

  const logoutMut = useMutation({
    ...logoutMutation(),
    onSuccess: async () => { await router.invalidate(); navigate({ to: '/login' }) },
  })

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm text-[var(--sea-ink)] no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] sm:px-4 sm:py-2"
          >
            <span className="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#f97316,#ef4444)]" />
            ComeRico 🍽️
          </Link>
        </h2>

        <div className="order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-sm font-semibold sm:order-none sm:w-auto sm:flex-nowrap sm:pb-0">
          <Link to="/" className="nav-link" activeProps={{ className: 'nav-link is-active' }}>
            Inicio
          </Link>
          <Link to="/dishes" className="nav-link" activeProps={{ className: 'nav-link is-active' }}>
            Platillos
          </Link>
          <Link to="/roulette" className="nav-link" activeProps={{ className: 'nav-link is-active' }}>
            Ruleta
          </Link>
          <Link to="/household" className="nav-link" activeProps={{ className: 'nav-link is-active' }}>
            Hogar
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {user ? (
            <>
              <span className="hidden text-sm font-medium text-[var(--sea-ink-soft)] sm:inline">
                {user.displayName}
              </span>
              <button
                onClick={() => logoutMut.mutate({})}
                disabled={logoutMut.isPending}
                className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink)] transition hover:border-orange-400 disabled:opacity-60"
              >
                Salir
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="rounded-full bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white no-underline transition hover:bg-orange-600"
            >
              Entrar
            </Link>
          )}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
