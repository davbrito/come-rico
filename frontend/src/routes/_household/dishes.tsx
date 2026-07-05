import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

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
import { useAppForm } from "#/components/form";
import { Button } from "#/components/ui/Button";
import { ConfirmDialog } from "#/components/ui/ConfirmDialog";
import { getApiErrorMessage } from "#/lib/api";
import { UNIT_LABELS, UNITS } from "#/lib/food";

export const Route = createFileRoute("/_household/dishes")({
  component: DishesPage,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(getDishesOptions());
  },
});

const UNIT_ITEMS = UNITS.map((unit) => ({ label: UNIT_LABELS[unit], value: unit }));

const dishNameSchema = z
  .string()
  .trim()
  .min(2, "Nombre muy corto (mín. 2 caracteres)")
  .max(80, "Nombre muy largo (máx. 80 caracteres)");

const dishDescriptionSchema = z.string().trim().max(300, "Máximo 300 caracteres");

const dishImageUrlSchema = z.union([z.literal(""), z.url("URL de imagen inválida")]);

function DishesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: dishes = [], isLoading } = useQuery(getDishesOptions());

  const invalidate = () => qc.invalidateQueries({ queryKey: getDishesQueryKey() });

  const createMut = useMutation({ ...createDishMutation(), onSuccess: invalidate });
  const deleteMut = useMutation({ ...deleteDishMutation(), onSuccess: invalidate });

  const createForm = useAppForm({
    defaultValues: { name: "", description: "", imageUrl: "" },
    onSubmit: async ({ value, formApi }) => {
      await createMut.mutateAsync({
        body: {
          name: value.name.trim(),
          description: value.description.trim() || null,
          imageUrl: value.imageUrl.trim() || null,
        },
      });
      formApi.reset();
      setShowForm(false);
    },
  });

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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            createForm.handleSubmit();
          }}
          className="island-shell mb-6 rounded-2xl p-6"
        >
          <h2 className="mb-4 text-base font-semibold text-[var(--sea-ink)]">Nuevo platillo</h2>
          <div className="space-y-3">
            <createForm.AppField
              name="name"
              validators={{
                onChange: dishNameSchema,
                onChangeAsyncDebounceMs: 400,
                onChangeAsync: async ({ value }) => {
                  const trimmed = value.trim().toLowerCase();
                  if (!trimmed) return undefined;
                  const exists = dishes.some((d) => d.name.trim().toLowerCase() === trimmed);
                  return exists ? "Ya tienes un platillo con ese nombre" : undefined;
                },
              }}
            >
              {(field) => <field.TextField label="Nombre *" required />}
            </createForm.AppField>

            <createForm.AppField
              name="description"
              validators={{ onChange: dishDescriptionSchema }}
            >
              {(field) => <field.TextField label="Descripción (opcional)" />}
            </createForm.AppField>

            <createForm.AppField name="imageUrl" validators={{ onChange: dishImageUrlSchema }}>
              {(field) => <field.TextField label="URL de imagen (opcional)" />}
            </createForm.AppField>
          </div>
          <div className="mt-4 flex gap-2">
            <createForm.AppForm>
              <createForm.SubmitButton className="px-5">Guardar</createForm.SubmitButton>
            </createForm.AppForm>
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

const ingredientAmountSchema = z
  .string()
  .refine((v) => v.trim() === "" || (!Number.isNaN(Number(v)) && Number(v) > 0), {
    message: "Debe ser mayor a 0",
  });

function DishEditor({ dish, onSaved }: { dish: DishDto; onSaved: () => void }) {
  const qc = useQueryClient();
  const { data: allTags = [] } = useQuery(getTagsOptions());

  const saveIngredientsMut = useMutation({ ...setDishIngredientsMutation(), onSuccess: onSaved });
  const saveTagsMut = useMutation({ ...setDishTagsMutation(), onSuccess: onSaved });

  const ingredientsForm = useAppForm({
    defaultValues: {
      ingredients: dish.ingredients.map((i) => ({
        name: i.name,
        amount: String(i.amount),
        unit: i.unit,
      })) as IngredientRow[],
    },
    onSubmit: async ({ value }) => {
      await saveIngredientsMut.mutateAsync({
        path: { id: dish.id },
        body: {
          ingredients: value.ingredients
            .filter((row) => row.name.trim())
            .map((row) => ({
              name: row.name.trim(),
              amount: Number(row.amount) || 0,
              unit: row.unit,
            })),
        },
      });
    },
  });

  const tagsForm = useAppForm({
    defaultValues: {
      tagIds: dish.tags.map((t) => t.id) as string[],
      newTagName: "",
    },
    onSubmit: async ({ value }) => {
      await saveTagsMut.mutateAsync({ path: { id: dish.id }, body: { tagIds: value.tagIds } });
    },
  });

  const createTagMut = useMutation({
    ...createTagMutation(),
    onSuccess: (tag) => {
      qc.invalidateQueries({ queryKey: getTagsQueryKey() });
      tagsForm.setFieldValue("tagIds", (ids) => [...ids, tag.id]);
      tagsForm.setFieldValue("newTagName", "");
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          tagsForm.handleSubmit();
        }}
      >
        <h4 className="mb-2 text-xs font-bold text-[var(--sea-ink-soft)] uppercase">Etiquetas</h4>
        <tagsForm.Field name="tagIds">
          {(field) => (
            <ToggleGroup
              multiple
              value={field.state.value}
              onValueChange={(ids) => field.handleChange(ids as string[])}
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
          )}
        </tagsForm.Field>

        <div className="mt-2 flex gap-2">
          <tagsForm.AppField
            name="newTagName"
            validators={{
              onChangeAsyncDebounceMs: 400,
              onChangeAsync: async ({ value }) => {
                const trimmed = value.trim().toLowerCase();
                if (!trimmed) return undefined;
                const exists = allTags.some((t) => t.name.toLowerCase() === trimmed);
                return exists ? "Esa etiqueta ya existe" : undefined;
              },
            }}
          >
            {(field) => <field.TextField label="Nueva etiqueta" size="sm" className="flex-1" />}
          </tagsForm.AppField>
          <tagsForm.Subscribe
            selector={(state) =>
              [state.values.newTagName, state.fieldMeta.newTagName?.errors.length ?? 0] as const
            }
          >
            {([newTagName, errorCount]) => (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const trimmed = newTagName.trim();
                  if (trimmed && errorCount === 0) createTagMut.mutate({ body: { name: trimmed } });
                }}
                disabled={createTagMut.isPending || !newTagName.trim() || errorCount > 0}
                className="rounded-lg bg-transparent disabled:opacity-50"
              >
                Crear
              </Button>
            )}
          </tagsForm.Subscribe>
          <tagsForm.AppForm>
            <tagsForm.SubmitButton size="sm" className="rounded-lg">
              Guardar etiquetas
            </tagsForm.SubmitButton>
          </tagsForm.AppForm>
        </div>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ingredientsForm.handleSubmit();
        }}
      >
        <h4 className="mb-2 text-xs font-bold text-[var(--sea-ink-soft)] uppercase">
          Ingredientes
        </h4>
        <ingredientsForm.Field name="ingredients" mode="array">
          {(ingredientsField) => (
            <div className="space-y-2">
              {ingredientsField.state.value.map((_, index) => (
                <div key={index} className="flex items-center gap-2">
                  <ingredientsForm.AppField
                    name={`ingredients[${index}].name`}
                    validators={{
                      onChange: ({ value }) => (!value.trim() ? "Requerido" : undefined),
                    }}
                  >
                    {(field) => (
                      <field.TextField label="Ingrediente" size="sm" className="min-w-0 flex-1" />
                    )}
                  </ingredientsForm.AppField>
                  <ingredientsForm.AppField
                    name={`ingredients[${index}].amount`}
                    validators={{ onChange: ingredientAmountSchema }}
                  >
                    {(field) => (
                      <field.TextField
                        label="Cant."
                        type="number"
                        min="0"
                        step="any"
                        size="sm"
                        className="w-16 px-2"
                      />
                    )}
                  </ingredientsForm.AppField>
                  <ingredientsForm.AppField name={`ingredients[${index}].unit`}>
                    {(field) => (
                      <field.SelectField
                        label="Unidad"
                        items={UNIT_ITEMS}
                        size="sm"
                        className="w-20"
                      />
                    )}
                  </ingredientsForm.AppField>
                  <Button
                    variant="danger-ghost"
                    size="sm"
                    onClick={() => ingredientsField.removeValue(index)}
                    aria-label="Quitar ingrediente"
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => ingredientsField.pushValue({ name: "", amount: "", unit: "Piece" })}
                className="rounded-lg bg-transparent"
              >
                + Ingrediente
              </Button>
            </div>
          )}
        </ingredientsForm.Field>
        <div className="mt-2">
          <ingredientsForm.AppForm>
            <ingredientsForm.SubmitButton size="sm" className="rounded-lg">
              Guardar ingredientes
            </ingredientsForm.SubmitButton>
          </ingredientsForm.AppForm>
        </div>
      </form>
    </div>
  );
}
