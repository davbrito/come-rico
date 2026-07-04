import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { householdsApi } from '#/lib/api'

export const Route = createFileRoute('/household')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/login' })
  },
  component: HouseholdPage,
})

const inputClass =
  'w-full rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none focus:border-orange-400'

function HouseholdPage() {
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  // Already in a household: show its info + invite code
  if (user!.householdId) {
    return (
      <main className="page-wrap px-4 pb-8 pt-10">
        <div className="mx-auto max-w-md">
          <h1 className="mb-6 text-center text-2xl font-bold text-[var(--sea-ink)]">🏠 Tu hogar</h1>
          <div className="island-shell rounded-2xl p-6 text-center">
            <p className="text-lg font-semibold text-[var(--sea-ink)]">{user!.householdName}</p>
            <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
              Tu rol: {user!.role === 'Admin' ? 'Administrador' : 'Miembro'}
            </p>
            {user!.inviteCode && (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
                  Código de invitación
                </p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(user!.inviteCode!).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    })
                  }}
                  className="mt-2 rounded-xl border border-dashed border-[var(--line)] bg-[var(--chip-bg)] px-6 py-3 font-mono text-xl font-bold tracking-[0.3em] text-[var(--sea-ink)] transition hover:border-orange-400"
                  title="Copiar código"
                >
                  {user!.inviteCode}
                </button>
                <p className="mt-2 text-xs text-[var(--sea-ink-soft)]">
                  {copied ? '¡Copiado!' : 'Compártelo con tu familia para que se unan. Toca para copiar.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    )
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await householdsApi.create(name)
      await router.invalidate()
      navigate({ to: '/' })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await householdsApi.join(inviteCode)
      await router.invalidate()
      navigate({ to: '/' })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page-wrap px-4 pb-8 pt-10">
      <div className="mx-auto max-w-md">
        <h1 className="mb-2 text-center text-2xl font-bold text-[var(--sea-ink)]">🏠 Tu hogar</h1>
        <p className="mb-6 text-center text-sm text-[var(--sea-ink-soft)]">
          Crea un hogar nuevo o únete a uno existente con un código de invitación.
        </p>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <form onSubmit={handleCreate} className="island-shell mb-4 rounded-2xl p-6">
          <h2 className="mb-3 text-base font-semibold text-[var(--sea-ink)]">Crear un hogar</h2>
          <input
            required
            placeholder="Nombre del hogar (ej. Los Brito Navas) *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
          >
            {busy ? 'Un momento…' : 'Crear hogar'}
          </button>
        </form>

        <form onSubmit={handleJoin} className="island-shell rounded-2xl p-6">
          <h2 className="mb-3 text-base font-semibold text-[var(--sea-ink)]">Unirme a un hogar</h2>
          <input
            required
            placeholder="Código de invitación *"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            className={`${inputClass} font-mono uppercase tracking-widest`}
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded-full border border-orange-500 px-5 py-2.5 text-sm font-semibold text-orange-500 transition hover:bg-orange-50 disabled:opacity-60 dark:hover:bg-orange-900/20"
          >
            {busy ? 'Un momento…' : 'Unirme'}
          </button>
        </form>
      </div>
    </main>
  )
}
