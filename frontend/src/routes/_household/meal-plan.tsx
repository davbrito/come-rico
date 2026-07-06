import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
import { Button } from "#/components/ui/Button";
import { Select } from "#/components/ui/Select";
import { getApiErrorMessage } from "#/lib/api";
import { addDays, formatDayLabel, getMonday, MEAL_LABELS, MEAL_TYPES, toDateKey } from "#/lib/food";

export const Route = createFileRoute("/_household/meal-plan")({
  loader: async ({ context }) => {
    const weekStart = getMonday(new Date());
    const query = { query: { from: toDateKey(weekStart), to: toDateKey(addDays(weekStart, 6)) } };
    await Promise.all([
      context.queryClient.ensureQueryData(getMealPlansOptions(query)),
      context.queryClient.ensureQueryData(getDishesOptions()),
    ]);
  },
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
  const dishItems = dishes.map((dish) => ({ label: dish.name, value: dish.id }));

  return (
    <main className="page-wrap px-4 pt-10 pb-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sea-ink">📅 Plan de comidas</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="inline-flex items-center gap-1"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
          >
            <ChevronLeft size={16} />
            Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(getMonday(new Date()))}>
            Hoy
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="inline-flex items-center gap-1"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
          >
            Siguiente
            <ChevronRight size={16} />
          </Button>
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
        <Button
          onClick={() => generateMut.mutate({ body: { anyDateInWeek: from } })}
          disabled={generateMut.isPending}
        >
          {generateMut.isPending ? "Generando…" : "🛒 Generar lista de compras de esta semana"}
        </Button>
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
                          <span className="text-sm font-semibold text-[var(--sea-ink-soft)] sm:text-xs">
                            {MEAL_LABELS[mealType]}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAdding(isAdding ? null : { date: dayKey, mealType })}
                          >
                            {isAdding ? "Cancelar" : "+ Añadir"}
                          </Button>
                        </div>
                        {entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="mt-1 flex items-center justify-between gap-2"
                          >
                            <span className="text-sm text-[var(--sea-ink)]">{entry.dishName}</span>
                            <Button
                              variant="danger-ghost"
                              size="sm"
                              onClick={() => deleteMut.mutate({ path: { id: entry.id } })}
                              aria-label={`Quitar ${entry.dishName}`}
                            >
                              ✕
                            </Button>
                          </div>
                        ))}
                        {isAdding && (
                          <Select
                            items={dishItems}
                            value={null}
                            onValueChange={(dishId) =>
                              createMut.mutate({
                                body: { dishId, date: dayKey, mealType },
                              })
                            }
                            placeholder="Elige un platillo…"
                            className="mt-2 w-full rounded-lg bg-[var(--card-bg,transparent)] px-2 py-1.5"
                          />
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
