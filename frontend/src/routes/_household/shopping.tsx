import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { produce } from "immer";
import { useState } from "react";
import { z } from "zod";

import {
  createShoppingItemMutation,
  deleteShoppingItemMutation,
  getShoppingItemsOptions,
  setShoppingItemPurchasedMutation,
} from "#/api/@tanstack/react-query.gen";
import type { MeasurementUnit, ShoppingItemDto } from "#/api/types.gen";
import { useAppForm } from "#/components/form";
import { Button } from "#/components/ui/Button";
import { Checkbox } from "#/components/ui/Checkbox";
import { getApiErrorMessage } from "#/lib/api";
import { UNIT_LABELS, UNITS } from "#/lib/food";

export const Route = createFileRoute("/_household/shopping")({
  component: ShoppingPage,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(getShoppingItemsOptions());
  },
});

function formatAmount(item: ShoppingItemDto): string | null {
  if (item.amount == null) return null;
  const unit = item.unit ? ` ${UNIT_LABELS[item.unit]}` : "";
  return `${item.amount}${unit}`;
}

const UNIT_ITEMS = [
  { label: "Sin unidad", value: "" },
  ...UNITS.map((unit) => ({ label: UNIT_LABELS[unit], value: unit as string })),
];

const itemNameSchema = z.string().trim().min(1, "Requerido");
const itemAmountSchema = z
  .string()
  .refine((v) => v.trim() === "" || (!Number.isNaN(Number(v)) && Number(v) > 0), {
    message: "Debe ser mayor a 0",
  });

function ShoppingPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const shoppingItemsOps = getShoppingItemsOptions();
  const { data: items = [], isLoading } = useQuery(shoppingItemsOps);

  const invalidate = () => qc.invalidateQueries({ queryKey: shoppingItemsOps.queryKey });

  const createMut = useMutation({ ...createShoppingItemMutation(), onSuccess: invalidate });
  const deleteMut = useMutation({ ...deleteShoppingItemMutation(), onSuccess: invalidate });

  const toggleMut = useMutation({
    ...setShoppingItemPurchasedMutation(),
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: shoppingItemsOps.queryKey });
      const previous = qc.getQueryData(shoppingItemsOps.queryKey);
      if (previous) {
        qc.setQueryData(shoppingItemsOps.queryKey, (data) =>
          produce(data, (draft) => {
            const item = draft?.find((i) => i.id === variables.path.id);
            if (item) item.isPurchased = variables.body.isPurchased;
          }),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(shoppingItemsOps.queryKey, context.previous);
      }
    },
    onSettled: () => {
      invalidate();
    },
  });

  const form = useAppForm({
    defaultValues: { name: "", amount: "", unit: null as MeasurementUnit | null },
    onSubmit: async ({ value, formApi }) => {
      await createMut.mutateAsync({
        body: {
          name: value.name.trim(),
          amount: value.amount ? Number(value.amount) : null,
          unit: value.unit,
        },
      });
      formApi.reset();
      setShowForm(false);
    },
  });

  const error =
    (createMut.isError && getApiErrorMessage(createMut.error)) ||
    (toggleMut.isError && getApiErrorMessage(toggleMut.error)) ||
    (deleteMut.isError && getApiErrorMessage(deleteMut.error)) ||
    null;

  const pending = items.filter((i) => !i.isPurchased);
  const purchased = items.filter((i) => i.isPurchased);

  return (
    <main className="page-wrap px-4 pt-10 pb-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-sea-ink">🛒 Lista de compras</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancelar" : "+ Agregar artículo"}
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
            form.handleSubmit();
          }}
          className="island-shell mb-6 rounded-2xl p-6"
        >
          <h2 className="mb-4 text-base font-semibold text-sea-ink">Nuevo artículo</h2>
          <div className="flex flex-wrap gap-3">
            <form.AppField name="name" validators={{ onChange: itemNameSchema }}>
              {(field) => <field.TextField label="Nombre *" required className="min-w-48 flex-1" />}
            </form.AppField>
            <form.AppField name="amount" validators={{ onChange: itemAmountSchema }}>
              {(field) => (
                <field.TextField
                  label="Cantidad"
                  type="number"
                  min="0"
                  step="any"
                  className="w-28"
                />
              )}
            </form.AppField>
            <form.AppField name="unit">
              {(field) => <field.SelectField label="Unidad" items={UNIT_ITEMS} className="w-32" />}
            </form.AppField>
          </div>
          <div className="mt-4">
            <form.AppForm>
              <form.SubmitButton className="px-5">Guardar</form.SubmitButton>
            </form.AppForm>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-sea-ink-soft">Cargando lista…</p>
      ) : items.length === 0 ? (
        <div className="island-shell rounded-2xl p-8 text-center">
          <p className="text-4xl">🧺</p>
          <p className="mt-2 text-sm text-sea-ink-soft">
            La lista está vacía. Agrega artículos o genérala desde el plan de comidas.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <ShoppingSection
            title={`Por comprar (${pending.length})`}
            items={pending}
            onToggle={(item) =>
              toggleMut.mutate({ path: { id: item.id }, body: { isPurchased: !item.isPurchased } })
            }
            onDelete={(item) => deleteMut.mutate({ path: { id: item.id } })}
          />
          {purchased.length > 0 && (
            <ShoppingSection
              title={`Comprado (${purchased.length})`}
              items={purchased}
              onToggle={(item) =>
                toggleMut.mutate({
                  path: { id: item.id },
                  body: { isPurchased: !item.isPurchased },
                })
              }
              onDelete={(item) => deleteMut.mutate({ path: { id: item.id } })}
            />
          )}
        </div>
      )}
    </main>
  );
}

function ShoppingSection({
  title,
  items,
  onToggle,
  onDelete,
}: {
  title: string;
  items: ShoppingItemDto[];
  onToggle: (item: ShoppingItemDto) => void;
  onDelete: (item: ShoppingItemDto) => void;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-sea-ink-soft uppercase">{title}</h2>
      <ul className="island-shell divide-y divide-line rounded-2xl">
        {items.map((item) => {
          const amount = formatAmount(item);
          return (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <Checkbox
                checked={item.isPurchased}
                onCheckedChange={() => onToggle(item)}
                aria-label={`Marcar ${item.name} como ${item.isPurchased ? "pendiente" : "comprado"}`}
              />
              <div className="flex-1">
                <span
                  className={`text-sm ${item.isPurchased ? "text-sea-ink-soft line-through" : "text-sea-ink"}`}
                >
                  {item.name}
                </span>
                {amount && <span className="ml-2 text-xs text-sea-ink-soft">{amount}</span>}
                {item.isAutoGenerated && (
                  <span className="ml-2 rounded-full bg-chip-bg px-2 py-0.5 text-xs text-sea-ink-soft">
                    auto
                  </span>
                )}
              </div>
              <Button
                variant="danger-ghost"
                size="sm"
                className="p-2 sm:px-0 sm:py-0"
                onClick={() => onDelete(item)}
                aria-label={`Eliminar ${item.name}`}
              >
                ✕
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
