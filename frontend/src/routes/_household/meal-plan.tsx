import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  createMealPlanMutation,
  deleteMealPlanMutation,
  generateShoppingListMutation,
  getDishesOptions,
  getMealPlansOptions,
  getMealPlansQueryKey,
  getShoppingItemsQueryKey,
} from "#/api/@tanstack/react-query.gen";
import type { MealType } from "#/api/types.gen";
import { getApiErrorMessage } from "#/lib/api";
import { addDays, formatDayLabel, getMonday, MEAL_LABELS, MEAL_TYPES, toDateKey } from "#/lib/food";

export const Route = createFileRoute("/_household/meal-plan")({
  component: MealPlanPage,
});

function MealPlanPage() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [adding, setAdding] = useState<{ date: string; mealType: MealType } | null>(null);

  const from = toDateKey(weekStart);
  const to = toDateKey(addDays(weekStart, 6));
  const plansQuery = { query: { from, to } };

  const { data: plans = [], isLoading } = useQuery(getMealPlansOptions(plansQuery));
  const { data: dishes = [] } = useQuery(getDishesOptions());

  const invalidate = () => qc.invalidateQueries({ queryKey: getMealPlansQueryKey(plansQuery) });

  const createMut = useMutation({
    ...createMealPlanMutation(),
    onSuccess: () => {
      invalidate();
      setAdding(null);
    },
  });

  const deleteMut = useMutation({ ...deleteMealPlanMutation(), onSuccess: invalidate });

  const generateMut = useMutation({
    ...generateShoppingListMutation(),
    onSuccess: () => qc.invalidateQueries({ queryKey: getShoppingItemsQueryKey() }),
  });

  const error =
    (createMut.isError && getApiErrorMessage(createMut.error)) ||
    (deleteMut.isError && getApiErrorMessage(deleteMut.error)) ||
    (generateMut.isError && getApiErrorMessage(generateMut.error)) ||
    null;

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayKey = toDateKey(new Date());

  return (
    <main className="page-wrap px-4 pt-10 pb-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sea-ink">📅 Plan de comidas</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="rounded-full border border-chip-line bg-chip-bg px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink)] transition hover:border-orange-400"
          >
            ← Anterior
          </button>
          <button
            onClick={() => setWeekStart(getMonday(new Date()))}
            className="rounded-full border border-chip-line bg-chip-bg px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink)] transition hover:border-orange-400"
          >
            Hoy
          </button>
          <button
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink)] transition hover:border-orange-400"
          >
            Siguiente →
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      {generateMut.isSuccess && (
        <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          Lista de compras generada con {generateMut.data?.length} ingrediente(s) consolidados.
        </p>
      )}

      <div className="mb-6 flex justify-end">
        <button
          onClick={() => generateMut.mutate({ body: { anyDateInWeek: from } })}
          disabled={generateMut.isPending}
          className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
        >
          {generateMut.isPending ? "Generando…" : "🛒 Generar lista de compras de esta semana"}
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--sea-ink-soft)]">Cargando plan…</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {days.map((day) => {
            const dayKey = toDateKey(day);
            return (
              <section
                key={dayKey}
                className={`island-shell rounded-2xl p-4 ${dayKey === todayKey ? "ring-2 ring-orange-400" : ""}`}
              >
                <h2 className="mb-3 text-sm font-bold text-[var(--sea-ink)] capitalize">
                  {formatDayLabel(day)}
                  {dayKey === todayKey && (
                    <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-600 dark:bg-orange-900/30">
                      Hoy
                    </span>
                  )}
                </h2>
                <div className="space-y-2">
                  {MEAL_TYPES.map((mealType) => {
                    const entries = plans.filter(
                      (p) => p.date === dayKey && p.mealType === mealType,
                    );
                    const isAdding = adding?.date === dayKey && adding.mealType === mealType;
                    return (
                      <div key={mealType} className="rounded-xl bg-[var(--chip-bg)] px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[var(--sea-ink-soft)]">
                            {MEAL_LABELS[mealType]}
                          </span>
                          <button
                            onClick={() => setAdding(isAdding ? null : { date: dayKey, mealType })}
                            className="text-xs font-semibold text-orange-500 hover:text-orange-600"
                          >
                            {isAdding ? "Cancelar" : "+ Añadir"}
                          </button>
                        </div>
                        {entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="mt-1 flex items-center justify-between gap-2"
                          >
                            <span className="text-sm text-[var(--sea-ink)]">{entry.dishName}</span>
                            <button
                              onClick={() => deleteMut.mutate({ path: { id: entry.id } })}
                              className="text-xs text-red-400 hover:text-red-600"
                              aria-label={`Quitar ${entry.dishName}`}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {isAdding && (
                          <select
                            autoFocus
                            defaultValue=""
                            onChange={(e) => {
                              if (!e.target.value) return;
                              createMut.mutate({
                                body: { dishId: e.target.value, date: dayKey, mealType },
                              });
                            }}
                            className="mt-2 w-full rounded-lg border border-[var(--line)] bg-[var(--card-bg,transparent)] px-2 py-1.5 text-sm text-[var(--sea-ink)]"
                          >
                            <option value="" disabled>
                              Elige un platillo…
                            </option>
                            {dishes.map((dish) => (
                              <option key={dish.id} value={dish.id}>
                                {dish.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
