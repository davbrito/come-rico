import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { authApi } from '#/lib/api'
import { useAuth } from '#/lib/auth'

export const Route = createFileRoute('/login')({ component: LoginPage })

const inputClass =
  'w-full rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none focus:border-orange-400'

function LoginPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ displayName: '', email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const user =
        mode === 'login'
          ? await authApi.login({ email: form.email, password: form.password })
          : await authApi.register(form)
      await refresh()
      navigate({ to: user.householdId ? '/' : '/household' })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page-wrap px-4 pb-8 pt-10">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-center text-2xl font-bold text-[var(--sea-ink)]">
          {mode === 'login' ? '👋 Inicia sesión' : '✨ Crea tu cuenta'}
        </h1>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="island-shell rounded-2xl p-6">
          <div className="space-y-3">
            {mode === 'register' && (
              <input
                required
                placeholder="Tu nombre *"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                className={inputClass}
              />
            )}
            <input
              required
              type="email"
              placeholder="Correo electrónico *"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className={inputClass}
            />
            <input
              required
              type="password"
              minLength={8}
              placeholder="Contraseña *"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
          >
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Registrarme'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[var(--sea-ink-soft)]">
          {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === 'login' ? 'register' : 'login'))
              setError(null)
            }}
            className="font-semibold text-orange-500 hover:underline"
          >
            {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </p>
      </div>
    </main>
  )
}
