import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { getRouletteHistoryOptions, spinRouletteMutation } from "#/api/@tanstack/react-query.gen";
import type { RouletteSessionDto, SpinRouletteResult } from "#/api/types.gen";
import { Button } from "#/components/ui/Button";
import { getApiErrorMessage } from "#/lib/api";
import { onRouletteSpun, startRouletteConnection, stopRouletteConnection } from "#/lib/signalr";

export const Route = createFileRoute("/roulette")({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: "/login" });
    if (!context.user.householdId) throw redirect({ to: "/household" });
  },
  component: RoulettePage,
});

function RoulettePage() {
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<SpinRouletteResult | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const { data: history = [] } = useQuery({
    ...getRouletteHistoryOptions({ query: { page: 1, pageSize: 20 } }),
    select: (data) => data as RouletteSessionDto[],
  });

  const spinMut = useMutation({
    ...spinRouletteMutation(),
    onMutate: () => {
      setSpinning(true);
      setWinner(null);
    },
    onError: () => setSpinning(false),
  });

  // Connect to SignalR and listen for real-time roulette events.
  // The auth cookie identifies the household — nothing to pass from the client.
  useEffect(() => {
    startRouletteConnection().catch(console.error);

    unsubRef.current = onRouletteSpun((result) => {
      setWinner(result);
      setSpinning(false);
    });

    return () => {
      unsubRef.current?.();
      stopRouletteConnection().catch(console.error);
    };
  }, []);

  return (
    <main className="page-wrap px-4 pt-10 pb-8">
      <h1 className="mb-6 text-2xl font-bold text-[var(--sea-ink)]">🎡 Ruleta</h1>

      {spinMut.isError && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {getApiErrorMessage(spinMut.error)}
        </p>
      )}

      {/* Roulette Spinner */}
      <section className="island-shell mb-6 flex flex-col items-center gap-6 rounded-2xl p-8">
        <div
          className={`flex h-36 w-36 items-center justify-center rounded-full border-4 border-orange-400 text-5xl transition-all duration-500 ${
            spinning ? "animate-spin" : ""
          }`}
        >
          {spinning ? "🎡" : winner ? "🍽️" : "🎲"}
        </div>

        {winner && !spinning && (
          <div className="text-center">
            <p className="text-xs font-semibold tracking-widest text-orange-500 uppercase">
              ¡El ganador es!
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--sea-ink)]">{winner.winnerDishName}</p>
            <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
              {new Date(winner.spunAt).toLocaleString("es-MX")}
            </p>
          </div>
        )}

        <Button
          size="lg"
          onClick={() => spinMut.mutate({})}
          disabled={spinning}
          className="shadow-md hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
        >
          {spinning ? "Girando…" : "¡Girar!"}
        </Button>
      </section>

      {/* History */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-[var(--sea-ink)]">Historial</h2>
        {history.length === 0 ? (
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
                    {session.winnerDishName ?? "—"}
                  </p>
                  <p className="text-xs text-[var(--sea-ink-soft)]">
                    {session.spunAt
                      ? new Date(session.spunAt).toLocaleString("es-MX")
                      : session.status}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    session.status === "Completed"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-800"
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
  );
}
