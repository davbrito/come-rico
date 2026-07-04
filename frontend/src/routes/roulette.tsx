import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { rouletteApi, type RouletteSession, type SpinRouletteResult } from '#/lib/api'
import {
  onRouletteSpun,
  startRouletteConnection,
  stopRouletteConnection,
} from '#/lib/signalr'

export const Route = createFileRoute('/roulette')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/login' })
    if (!context.user.householdId) throw redirect({ to: '/household' })
  },
  component: RoulettePage,
})

function RoulettePage() {
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<SpinRouletteResult | null>(null)
  const [history, setHistory] = useState<RouletteSession[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  // Connect to SignalR and listen for real-time roulette events.
  // The auth cookie identifies the household — nothing to pass from the client.
  useEffect(() => {
    startRouletteConnection().catch(console.error)

    unsubRef.current = onRouletteSpun((result) => {
      setWinner(result)
      setSpinning(false)
    })

    return () => {
      unsubRef.current?.()
      stopRouletteConnection().catch(console.error)
    }
  }, [])

  useEffect(() => {
    rouletteApi
      .getHistory()
      .then(setHistory)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingHistory(false))
  }, [])

  const handleSpin = async () => {
    setError(null)
    setSpinning(true)
    setWinner(null)
    try {
      // The REST call triggers the spin; SignalR broadcasts the result
      await rouletteApi.spin()
      // Winner is set via the SignalR subscription above
    } catch (e) {
      setError((e as Error).message)
      setSpinning(false)
    }
  }

  return (
    <main className="page-wrap px-4 pb-8 pt-10">
      <h1 className="mb-6 text-2xl font-bold text-[var(--sea-ink)]">🎡 Ruleta</h1>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Roulette Spinner */}
      <section className="island-shell mb-6 flex flex-col items-center gap-6 rounded-2xl p-8">
        <div
          className={`flex h-36 w-36 items-center justify-center rounded-full border-4 border-orange-400 text-5xl transition-all duration-500 ${
            spinning ? 'animate-spin' : ''
          }`}
        >
          {spinning ? '🎡' : winner ? '🍽️' : '🎲'}
        </div>

        {winner && !spinning && (
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
              ¡El ganador es!
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--sea-ink)]">
              {winner.winnerDishName}
            </p>
            <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
              {new Date(winner.spunAt).toLocaleString('es-MX')}
            </p>
          </div>
        )}

        <button
          onClick={handleSpin}
          disabled={spinning}
          className="rounded-full bg-orange-500 px-8 py-3 text-base font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-orange-600 active:translate-y-0 disabled:opacity-50"
        >
          {spinning ? 'Girando…' : '¡Girar!'}
        </button>
      </section>

      {/* History */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-[var(--sea-ink)]">Historial</h2>
        {loadingHistory ? (
          <p className="text-sm text-[var(--sea-ink-soft)]">Cargando historial…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-[var(--sea-ink-soft)]">No hay giros todavía.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((session) => (
              <li
                key={session.id}
                className="island-shell flex items-center justify-between rounded-xl px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--sea-ink)]">
                    {session.winnerDishName ?? '—'}
                  </p>
                  <p className="text-xs text-[var(--sea-ink-soft)]">
                    {session.spunAt
                      ? new Date(session.spunAt).toLocaleString('es-MX')
                      : session.status}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    session.status === 'Completed'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800'
                  }`}
                >
                  {session.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
