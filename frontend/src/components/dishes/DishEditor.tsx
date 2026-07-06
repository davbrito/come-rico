import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  getTagsOptions,
  setDishIngredientsMutation,
  setDishTagsMutation,
} from "#/api/@tanstack/react-query.gen";
import type { DishDto } from "#/api/types.gen";
import { useAppForm } from "#/components/form";
import { Button } from "#/components/ui/Button";
import { TagsInput } from "#/components/ui/TagsInput";
import { getApiErrorMessage } from "#/lib/api";
import { UNIT_LABELS, UNITS } from "#/lib/food";

import { ingredientAmountSchema, type IngredientRow } from "./types";

const UNIT_ITEMS = UNITS.map((unit) => ({ label: UNIT_LABELS[unit], value: unit }));

export function DishEditor({
  dish,
  open,
  onOpenChange,
  onSaved,
}: {
  dish: DishDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { data: allTags = [] } = useQuery(getTagsOptions());

  const saveIngredientsMut = useMutation(setDishIngredientsMutation());
  const saveTagsMut = useMutation(setDishTagsMutation());

  const form = useAppForm({
    defaultValues: {
      tagNames: dish.tags.map((t) => t.name) as string[],
      ingredients: dish.ingredients.map((i) => ({
        name: i.name,
        amount: String(i.amount),
        unit: i.unit,
      })) as IngredientRow[],
    },
    onSubmit: async ({ value }) => {
      await Promise.all([
        saveIngredientsMut.mutateAsync({
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
        }),
        saveTagsMut.mutateAsync({ path: { id: dish.id }, body: { tagNames: value.tagNames } }),
      ]);
      onSaved();
      onOpenChange(false);
    },
  });

  const error =
    (saveIngredientsMut.isError && getApiErrorMessage(saveIngredientsMut.error)) ||
    (saveTagsMut.isError && getApiErrorMessage(saveTagsMut.error)) ||
    null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="island-shell fixed top-1/2 left-1/2 max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-6 transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          <Dialog.Title className="text-base font-semibold text-sea-ink">
            Ingredientes y etiquetas
          </Dialog.Title>

          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="mt-4 space-y-4"
          >
            <div>
              <h4 className="mb-2 text-xs font-bold text-sea-ink-soft uppercase">Etiquetas</h4>
              <form.Field name="tagNames">
                {(field) => (
                  <TagsInput
                    value={field.state.value}
                    onValueChange={(names) => field.handleChange(names)}
                    suggestions={allTags.map((t) => t.name)}
                    placeholder="Agregar etiqueta…"
                  />
                )}
              </form.Field>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold text-sea-ink-soft uppercase">Ingredientes</h4>
              <form.Field name="ingredients" mode="array">
                {(ingredientsField) => (
                  <div className="space-y-2">
                    {ingredientsField.state.value.map((_, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <form.AppField
                          name={`ingredients[${index}].name`}
                          validators={{
                            onChange: ({ value }) => (!value.trim() ? "Requerido" : undefined),
                          }}
                        >
                          {(field) => (
                            <field.TextField
                              label="Ingrediente"
                              size="sm"
                              className="min-w-0 flex-1"
                            />
                          )}
                        </form.AppField>
                        <form.AppField
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
                        </form.AppField>
                        <form.AppField name={`ingredients[${index}].unit`}>
                          {(field) => (
                            <field.SelectField
                              label="Unidad"
                              items={UNIT_ITEMS}
                              size="sm"
                              className="w-20"
                            />
                          )}
                        </form.AppField>
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
                      onClick={() =>
                        ingredientsField.pushValue({ name: "", amount: "", unit: "Piece" })
                      }
                      className="rounded-lg bg-transparent"
                    >
                      + Ingrediente
                    </Button>
                  </div>
                )}
              </form.Field>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close render={<Button variant="outline" size="sm" />}>Cancelar</Dialog.Close>
              <form.AppForm>
                <form.SubmitButton size="sm" className="rounded-lg">
                  Guardar
                </form.SubmitButton>
              </form.AppForm>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
