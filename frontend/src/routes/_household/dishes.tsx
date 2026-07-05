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
import { getApiErrorMessage } from "#/lib/api";
import { UNIT_LABELS, UNITS } from "#/lib/food";

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

  const handleDelete = (id: string) => {
    if (!confirm("¿Eliminar este platillo?")) return;
    deleteMut.mutate({ path: { id } });
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
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          {showForm ? "Cancelar" : "+ Agregar platillo"}
        </button>
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
            <input
              required
              placeholder="Nombre *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none focus:border-orange-400"
            />
            <input
              placeholder="Descripción (opcional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none focus:border-orange-400"
            />
            <input
              placeholder="URL de imagen (opcional)"
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none focus:border-orange-400"
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={createMut.isPending}
              className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
            >
              {createMut.isPending ? "Guardando…" : "Guardar"}
            </button>
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
                <button
                  onClick={() => setEditingId((id) => (id === dish.id ? null : dish.id))}
                  className="rounded-full border border-[var(--chip-line)] px-3 py-1 text-xs font-medium text-[var(--sea-ink)] transition hover:border-orange-400"
                >
                  {editingId === dish.id ? "Cerrar" : "Ingredientes y etiquetas"}
                </button>
                <button
                  onClick={() => handleDelete(dish.id)}
                  className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-500 transition hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                >
                  Eliminar
                </button>
              </div>
              {editingId === dish.id && <DishEditor dish={dish} onSaved={invalidate} />}
            </li>
          ))}
        </ul>
      )}
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

  const toggleTag = (tagId: string) =>
    setSelectedTagIds((ids) =>
      ids.includes(tagId) ? ids.filter((id) => id !== tagId) : [...ids, tagId],
    );

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
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                selectedTagIds.includes(tag.id)
                  ? "border-orange-400 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                  : "border-[var(--chip-line)] text-[var(--sea-ink-soft)] hover:border-orange-300"
              }`}
            >
              #{tag.name}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            placeholder="Nueva etiqueta"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            className="flex-1 rounded-lg border border-[var(--line)] bg-transparent px-3 py-1.5 text-xs text-[var(--sea-ink)] outline-none focus:border-orange-400"
          />
          <button
            onClick={() =>
              newTagName.trim() && createTagMut.mutate({ body: { name: newTagName.trim() } })
            }
            disabled={createTagMut.isPending || !newTagName.trim()}
            className="rounded-lg border border-[var(--chip-line)] px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink)] transition hover:border-orange-400 disabled:opacity-50"
          >
            Crear
          </button>
          <button
            onClick={() =>
              saveTagsMut.mutate({ path: { id: dish.id }, body: { tagIds: selectedTagIds } })
            }
            disabled={saveTagsMut.isPending}
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
          >
            {saveTagsMut.isPending ? "…" : "Guardar etiquetas"}
          </button>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-bold text-[var(--sea-ink-soft)] uppercase">
          Ingredientes
        </h4>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                placeholder="Ingrediente"
                value={row.name}
                onChange={(e) => updateRow(index, { name: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-transparent px-3 py-1.5 text-xs text-[var(--sea-ink)] outline-none focus:border-orange-400"
              />
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Cant."
                value={row.amount}
                onChange={(e) => updateRow(index, { amount: e.target.value })}
                className="w-16 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-xs text-[var(--sea-ink)] outline-none focus:border-orange-400"
              />
              <select
                value={row.unit}
                onChange={(e) => updateRow(index, { unit: e.target.value as MeasurementUnit })}
                className="w-20 rounded-lg border border-[var(--line)] bg-transparent px-1 py-1.5 text-xs text-[var(--sea-ink)]"
              >
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setRows((rs) => rs.filter((_, i) => i !== index))}
                className="text-xs text-red-400 hover:text-red-600"
                aria-label="Quitar ingrediente"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => setRows((rs) => [...rs, { name: "", amount: "", unit: "Piece" }])}
            className="rounded-lg border border-[var(--chip-line)] px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink)] transition hover:border-orange-400"
          >
            + Ingrediente
          </button>
          <button
            onClick={saveIngredients}
            disabled={saveIngredientsMut.isPending}
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
          >
            {saveIngredientsMut.isPending ? "…" : "Guardar ingredientes"}
          </button>
        </div>
      </div>
    </div>
  );
}
