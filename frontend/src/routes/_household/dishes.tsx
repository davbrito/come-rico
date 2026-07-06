import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  deleteDishMutation,
  getDishesOptions,
  getDishesQueryKey,
} from "#/api/@tanstack/react-query.gen";
import { DishEditor } from "#/components/dishes/DishEditor";
import { DishForm } from "#/components/dishes/DishForm";
import { Button } from "#/components/ui/Button";
import { ConfirmDialog } from "#/components/ui/ConfirmDialog";
import { getApiErrorMessage } from "#/lib/api";

export const Route = createFileRoute("/_household/dishes")({
  component: DishesPage,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(getDishesOptions());
  },
});

function DishesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: dishes = [], isLoading } = useQuery(getDishesOptions());

  const invalidate = () => qc.invalidateQueries({ queryKey: getDishesQueryKey() });

  const deleteMut = useMutation({ ...deleteDishMutation(), onSuccess: invalidate });

  const error = deleteMut.isError ? getApiErrorMessage(deleteMut.error) : null;

  return (
    <main className="page-wrap px-4 pt-10 pb-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-sea-ink">🍲 Platillos</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancelar" : "+ Agregar platillo"}
        </Button>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      {showForm && (
        <DishForm
          dishes={dishes}
          onSaved={() => {
            invalidate();
            setShowForm(false);
          }}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-sea-ink-soft">Cargando platillos…</p>
      ) : dishes.length === 0 ? (
        <div className="island-shell rounded-2xl p-8 text-center">
          <p className="text-4xl">🍽️</p>
          <p className="mt-2 text-sm text-sea-ink-soft">
            Aún no hay platillos. ¡Agrega el primero!
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dishes.map((dish) => (
            <li key={dish.id} className="island-shell flex flex-col gap-2 rounded-2xl p-5">
              {dish.imageUrl && (
                <img
                  src={dish.imageUrl}
                  alt={dish.name}
                  className="mb-1 h-32 w-full rounded-xl object-cover"
                />
              )}
              <h3 className="text-base font-semibold text-sea-ink">{dish.name}</h3>
              {dish.description && <p className="text-sm text-sea-ink-soft">{dish.description}</p>}
              {dish.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {dish.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full bg-chip-bg px-2 py-0.5 text-xs text-sea-ink-soft"
                    >
                      #{tag.name}
                    </span>
                  ))}
                </div>
              )}
              {dish.ingredients.length > 0 && (
                <p className="text-xs text-sea-ink-soft">
                  🧾 {dish.ingredients.length} ingrediente(s)
                </p>
              )}
              <div className="mt-auto flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingId((id) => (id === dish.id ? null : dish.id))}
                  className="py-1 font-medium"
                >
                  Ingredientes y etiquetas
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeletingId(dish.id)}
                  className="py-1"
                >
                  Eliminar
                </Button>
              </div>
              <DishEditor
                dish={dish}
                open={editingId === dish.id}
                onOpenChange={(open) => setEditingId(open ? dish.id : null)}
                onSaved={invalidate}
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
        title="¿Eliminar este platillo?"
        description="El platillo se eliminará de forma permanente."
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (deletingId) deleteMut.mutate({ path: { id: deletingId } });
          setDeletingId(null);
        }}
      />
    </main>
  );
}
