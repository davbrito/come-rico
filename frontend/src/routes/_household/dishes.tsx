import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  createDishMutation,
  createTagMutation,
  deleteDishMutation,
  getDishesOptions,
  getDishesQueryKey,
  getTagsOptions,
  getTagsQueryKey,
  setDishIngredientsMutation,
  setDishTagsMutation,
} from "#/api/@tanstack/react-query.gen";
import type { DishDto, MeasurementUnit } from "#/api/types.gen";
import { Button } from "#/components/ui/Button";
import { ConfirmDialog } from "#/components/ui/ConfirmDialog";
import { Input } from "#/components/ui/Input";
import { Select } from "#/components/ui/Select";
import { getApiErrorMessage } from "#/lib/api";
import { UNIT_LABELS, UNITS } from "#/lib/food";

export const Route = createFileRoute("/_household/dishes")({
  component: DishesPage,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(getDishesOptions());
  },
});

const UNIT_ITEMS = UNITS.map((unit) => ({ label: UNIT_LABELS[unit], value: unit }));

function DishesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", imageUrl: "" });

  const { data: dishes = [], isLoading } = useQuery(getDishesOptions());

  const invalidate = () => qc.invalidateQueries({ queryKey: getDishesQueryKey() });

  const createMut = useMutation({
    ...createDishMutation(),
    onSuccess: () => {
      invalidate();
      setForm({ name: "", description: "", imageUrl: "" });
      setShowForm(false);
    },
  });

  const deleteMut = useMutation({ ...deleteDishMutation(), onSuccess: invalidate });

  const handleCreate = (e: React.SubmitEvent) => {
    e.preventDefault();
    createMut.mutate({
      body: {
        name: form.name,
        description: form.description || null,
        imageUrl: form.imageUrl || null,
      },
    });
  };

  const error = createMut.isError
    ? getApiErrorMessage(createMut.error)
    : deleteMut.isError
      ? getApiErrorMessage(deleteMut.error)
      : null;

  return (
    <main className="page-wrap px-4 pt-10 pb-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--sea-ink)]">🍲 Platillos</h1>
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
        <form onSubmit={handleCreate} className="island-shell mb-6 rounded-2xl p-6">
          <h2 className="mb-4 text-base font-semibold text-[var(--sea-ink)]">Nuevo platillo</h2>
          <div className="space-y-3">
            <Input
              required
              placeholder="Nombre *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              placeholder="Descripción (opcional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <Input
              placeholder="URL de imagen (opcional)"
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={createMut.isPending} className="px-5">
              {createMut.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--sea-ink-soft)]">Cargando platillos…</p>
      ) : dishes.length === 0 ? (
        <div className="island-shell rounded-2xl p-8 text-center">
          <p className="text-4xl">🍽️</p>
          <p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
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
              <h3 className="text-base font-semibold text-[var(--sea-ink)]">{dish.name}</h3>
              {dish.description && (
                <p className="text-sm text-[var(--sea-ink-soft)]">{dish.description}</p>
              )}
              {dish.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {dish.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full bg-[var(--chip-bg)] px-2 py-0.5 text-xs text-[var(--sea-ink-soft)]"
                    >
                      #{tag.name}
                    </span>
                  ))}
                </div>
              )}
              {dish.ingredients.length > 0 && (
                <p className="text-xs text-[var(--sea-ink-soft)]">
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
                  {editingId === dish.id ? "Cerrar" : "Ingredientes y etiquetas"}
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
              {editingId === dish.id && <DishEditor dish={dish} onSaved={invalidate} />}
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

type IngredientRow = { name: string; amount: string; unit: MeasurementUnit };

function DishEditor({ dish, onSaved }: { dish: DishDto; onSaved: () => void }) {
  const qc = useQueryClient();
  const { data: allTags = [] } = useQuery(getTagsOptions());

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(dish.tags.map((t) => t.id));
  const [newTagName, setNewTagName] = useState("");
  const [rows, setRows] = useState<IngredientRow[]>(
    dish.ingredients.map((i) => ({ name: i.name, amount: String(i.amount), unit: i.unit })),
  );

  const saveIngredientsMut = useMutation({ ...setDishIngredientsMutation(), onSuccess: onSaved });
  const saveTagsMut = useMutation({ ...setDishTagsMutation(), onSuccess: onSaved });

  const createTagMut = useMutation({
    ...createTagMutation(),
    onSuccess: (tag) => {
      qc.invalidateQueries({ queryKey: getTagsQueryKey() });
      setSelectedTagIds((ids) => [...ids, tag.id]);
      setNewTagName("");
    },
  });

  const updateRow = (index: number, patch: Partial<IngredientRow>) =>
    setRows((rs) => rs.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const saveIngredients = () =>
    saveIngredientsMut.mutate({
      path: { id: dish.id },
      body: {
        ingredients: rows
          .filter((row) => row.name.trim())
          .map((row) => ({ name: row.name, amount: Number(row.amount) || 0, unit: row.unit })),
      },
    });

  const error =
    (saveIngredientsMut.isError && getApiErrorMessage(saveIngredientsMut.error)) ||
    (saveTagsMut.isError && getApiErrorMessage(saveTagsMut.error)) ||
    (createTagMut.isError && getApiErrorMessage(createTagMut.error)) ||
    null;

  return (
    <div className="mt-2 space-y-4 rounded-xl bg-[var(--chip-bg)] p-3">
      {error && <p className="text-xs text-red-500">{error}</p>}

      <div>
        <h4 className="mb-2 text-xs font-bold text-[var(--sea-ink-soft)] uppercase">Etiquetas</h4>
        <ToggleGroup
          multiple
          value={selectedTagIds}
          onValueChange={(ids) => setSelectedTagIds(ids as string[])}
          aria-label="Etiquetas del platillo"
          className="flex flex-wrap gap-1.5"
        >
          {allTags.map((tag) => (
            <Toggle
              key={tag.id}
              value={tag.id}
              className="rounded-full border border-[var(--chip-line)] px-2.5 py-1 text-xs font-medium text-[var(--sea-ink-soft)] transition hover:border-orange-300 data-[pressed]:border-orange-400 data-[pressed]:bg-orange-100 data-[pressed]:text-orange-700 dark:data-[pressed]:bg-orange-900/30 dark:data-[pressed]:text-orange-300"
            >
              #{tag.name}
            </Toggle>
          ))}
        </ToggleGroup>
        <div className="mt-2 flex gap-2">
          <Input
            size="sm"
            placeholder="Nueva etiqueta"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              newTagName.trim() && createTagMut.mutate({ body: { name: newTagName.trim() } })
            }
            disabled={createTagMut.isPending || !newTagName.trim()}
            className="rounded-lg bg-transparent disabled:opacity-50"
          >
            Crear
          </Button>
          <Button
            size="sm"
            onClick={() =>
              saveTagsMut.mutate({ path: { id: dish.id }, body: { tagIds: selectedTagIds } })
            }
            disabled={saveTagsMut.isPending}
            className="rounded-lg"
          >
            {saveTagsMut.isPending ? "…" : "Guardar etiquetas"}
          </Button>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-bold text-[var(--sea-ink-soft)] uppercase">
          Ingredientes
        </h4>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                size="sm"
                placeholder="Ingrediente"
                value={row.name}
                onChange={(e) => updateRow(index, { name: e.target.value })}
                className="min-w-0 flex-1"
              />
              <Input
                size="sm"
                type="number"
                min="0"
                step="any"
                placeholder="Cant."
                value={row.amount}
                onChange={(e) => updateRow(index, { amount: e.target.value })}
                className="w-16 px-2"
              />
              <Select
                size="sm"
                items={UNIT_ITEMS}
                value={row.unit}
                onValueChange={(unit) => updateRow(index, { unit })}
                className="w-20"
              />
              <Button
                variant="danger-ghost"
                size="sm"
                onClick={() => setRows((rs) => rs.filter((_, i) => i !== index))}
                aria-label="Quitar ingrediente"
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows((rs) => [...rs, { name: "", amount: "", unit: "Piece" }])}
            className="rounded-lg bg-transparent"
          >
            + Ingrediente
          </Button>
          <Button
            size="sm"
            onClick={saveIngredients}
            disabled={saveIngredientsMut.isPending}
            className="rounded-lg"
          >
            {saveIngredientsMut.isPending ? "…" : "Guardar ingredientes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
