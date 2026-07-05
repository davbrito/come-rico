import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  createShoppingItemMutation,
  deleteShoppingItemMutation,
  getShoppingItemsOptions,
  getShoppingItemsQueryKey,
  setShoppingItemPurchasedMutation,
} from "#/api/@tanstack/react-query.gen";
import type { MeasurementUnit, ShoppingItemDto } from "#/api/types.gen";
import { Button } from "#/components/ui/Button";
import { Checkbox } from "#/components/ui/Checkbox";
import { Input } from "#/components/ui/Input";
import { Select } from "#/components/ui/Select";
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

function ShoppingPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", amount: "", unit: "" });

  const { data: items = [], isLoading } = useQuery(getShoppingItemsOptions());

  const invalidate = () => qc.invalidateQueries({ queryKey: getShoppingItemsQueryKey() });

  const createMut = useMutation({
    ...createShoppingItemMutation(),
    onSuccess: () => {
      invalidate();
      setForm({ name: "", amount: "", unit: "" });
      setShowForm(false);
    },
  });

  const toggleMut = useMutation({ ...setShoppingItemPurchasedMutation(), onSuccess: invalidate });
  const deleteMut = useMutation({ ...deleteShoppingItemMutation(), onSuccess: invalidate });

  const handleCreate = (e: React.SubmitEvent) => {
    e.preventDefault();
    createMut.mutate({
      body: {
        name: form.name,
        amount: form.amount ? Number(form.amount) : null,
        unit: form.unit ? (form.unit as MeasurementUnit) : null,
      },
    });
  };

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
        <h1 className="text-2xl font-bold text-[var(--sea-ink)]">🛒 Lista de compras</h1>
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
        <form onSubmit={handleCreate} className="island-shell mb-6 rounded-2xl p-6">
          <h2 className="mb-4 text-base font-semibold text-[var(--sea-ink)]">Nuevo artículo</h2>
          <div className="flex flex-wrap gap-3">
            <Input
              required
              placeholder="Nombre *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="min-w-48 flex-1"
            />
            <Input
              type="number"
              min="0"
              step="any"
              placeholder="Cantidad"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-28"
            />
            <Select
              items={UNIT_ITEMS}
              value={form.unit}
              onValueChange={(unit) => setForm((f) => ({ ...f, unit }))}
              className="w-32"
            />
          </div>
          <div className="mt-4">
            <Button type="submit" disabled={createMut.isPending} className="px-5">
              {createMut.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--sea-ink-soft)]">Cargando lista…</p>
      ) : items.length === 0 ? (
        <div className="island-shell rounded-2xl p-8 text-center">
          <p className="text-4xl">🧺</p>
          <p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
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
      <h2 className="mb-2 text-sm font-bold text-[var(--sea-ink-soft)] uppercase">{title}</h2>
      <ul className="island-shell divide-y divide-[var(--line)] rounded-2xl">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-3">
            <Checkbox
              checked={item.isPurchased}
              onCheckedChange={() => onToggle(item)}
              aria-label={`Marcar ${item.name} como ${item.isPurchased ? "pendiente" : "comprado"}`}
            />
            <div className="flex-1">
              <span
                className={`text-sm ${item.isPurchased ? "text-[var(--sea-ink-soft)] line-through" : "text-[var(--sea-ink)]"}`}
              >
                {item.name}
              </span>
              {formatAmount(item) && (
                <span className="ml-2 text-xs text-[var(--sea-ink-soft)]">
                  {formatAmount(item)}
                </span>
              )}
              {item.isAutoGenerated && (
                <span className="ml-2 rounded-full bg-[var(--chip-bg)] px-2 py-0.5 text-xs text-[var(--sea-ink-soft)]">
                  auto
                </span>
              )}
            </div>
            <Button
              variant="danger-ghost"
              size="sm"
              onClick={() => onDelete(item)}
              aria-label={`Eliminar ${item.name}`}
            >
              ✕
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
