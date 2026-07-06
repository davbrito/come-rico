import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";

import { createDishMutation, createUploadMutation } from "#/api/@tanstack/react-query.gen";
import type { DishDto } from "#/api/types.gen";
import { useAppForm } from "#/components/form";
import { ImagePicker } from "#/components/ImagePicker";
import { Button } from "#/components/ui/Button";
import { getApiErrorMessage } from "#/lib/api";
import { UNIT_LABELS, UNITS } from "#/lib/food";

import { ingredientAmountSchema, type IngredientRow } from "./types";

const UNIT_ITEMS = UNITS.map((unit) => ({ label: UNIT_LABELS[unit], value: unit }));

const dishNameSchema = z
  .string()
  .trim()
  .min(2, "Nombre muy corto (mín. 2 caracteres)")
  .max(80, "Nombre muy largo (máx. 80 caracteres)");

const dishDescriptionSchema = z.string().trim().max(300, "Máximo 300 caracteres");

export function DishForm({ dishes, onSaved }: { dishes: DishDto[]; onSaved: () => void }) {
  const createMut = useMutation({ ...createDishMutation(), onSuccess: onSaved });
  const uploadMut = useMutation(createUploadMutation());

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const createForm = useAppForm({
    defaultValues: { name: "", description: "", ingredients: [] as IngredientRow[] },
    onSubmit: async ({ value, formApi }) => {
      setUploadError(null);
      let imageUploadId: string | null = null;
      if (imageFile) {
        // Ticket first (Pending row + presigned PUT URL), then PUT straight to
        // R2 so upload bytes never flow through the API. The signature pins
        // Content-Type and Content-Length: the browser sets Content-Length
        // from the body (= the declared file.size), and we send the same
        // Content-Type we declared when requesting the ticket.
        const ticket = await uploadMut.mutateAsync({
          body: {
            type: "image",
            keyFolder: "dishes",
            contentType: imageFile.type,
            sizeBytes: imageFile.size,
          },
        });
        const res = await fetch(ticket.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": imageFile.type },
          body: imageFile,
        }).catch(() => null);
        if (!res?.ok) {
          setUploadError("No se pudo subir la imagen. Inténtalo de nuevo.");
          return;
        }
        imageUploadId = ticket.uploadId;
      }
      await createMut.mutateAsync({
        body: {
          name: value.name.trim(),
          description: value.description.trim() || null,
          imageUploadId,
          ingredients: value.ingredients
            .filter((row) => row.name.trim())
            .map((row) => ({
              name: row.name.trim(),
              amount: Number(row.amount) || 0,
              unit: row.unit,
            })),
        },
      });
      formApi.reset();
      setImageFile(null);
    },
  });

  const error =
    uploadError ??
    (createMut.isError
      ? getApiErrorMessage(createMut.error)
      : uploadMut.isError
        ? getApiErrorMessage(uploadMut.error)
        : null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        createForm.handleSubmit();
      }}
      className="island-shell mb-6 rounded-2xl p-6"
    >
      <h2 className="mb-4 text-base font-semibold text-sea-ink">Nuevo platillo</h2>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

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

        <createForm.AppField name="description" validators={{ onChange: dishDescriptionSchema }}>
          {(field) => <field.TextField label="Descripción (opcional)" />}
        </createForm.AppField>

        <ImagePicker file={imageFile} onChange={setImageFile} />

        <div>
          <h3 className="mb-2 text-xs font-bold text-sea-ink-soft uppercase">
            Ingredientes (opcional)
          </h3>
          <createForm.Field name="ingredients" mode="array">
            {(ingredientsField) => (
              <div className="space-y-2">
                {ingredientsField.state.value.map((_, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <createForm.AppField
                      name={`ingredients[${index}].name`}
                      validators={{
                        onChange: ({ value }) => (!value.trim() ? "Requerido" : undefined),
                      }}
                    >
                      {(field) => (
                        <field.TextField label="Ingrediente" size="sm" className="min-w-0 flex-1" />
                      )}
                    </createForm.AppField>
                    <createForm.AppField
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
                    </createForm.AppField>
                    <createForm.AppField name={`ingredients[${index}].unit`}>
                      {(field) => (
                        <field.SelectField
                          label="Unidad"
                          items={UNIT_ITEMS}
                          size="sm"
                          className="w-20"
                        />
                      )}
                    </createForm.AppField>
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
          </createForm.Field>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <createForm.AppForm>
          <createForm.SubmitButton className="px-5">Guardar</createForm.SubmitButton>
        </createForm.AppForm>
      </div>
    </form>
  );
}
