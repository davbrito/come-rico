import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { produce } from "immer";
import { useState } from "react";
import { z } from "zod";

import {
  createShoppingItemMutation,
  deleteShoppingItemMutation,
  getProductsOptions,
  getProductsQueryKey,
  getShoppingItemsOptions,
  getShoppingItemsQueryKey,
  makeShoppingItemRecurringMutation,
  markProductInStockMutation,
  markProductOutOfStockMutation,
  setShoppingItemPurchasedMutation,
  snoozeProductMutation,
  syncShoppingListMutation,
} from "#/api/@tanstack/react-query.gen";
import { syncShoppingList } from "#/api/sdk.gen";
import type {
  MeasurementUnit,
  ProductCategory,
  ProductDto,
  ShoppingItemDto,
} from "#/api/types.gen";
import { useAppForm } from "#/components/form";
import { Button } from "#/components/ui/Button";
import { Checkbox } from "#/components/ui/Checkbox";
import { Select } from "#/components/ui/Select";
import { toastManager } from "#/components/ui/Toaster";
import { getApiErrorMessage } from "#/lib/api";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS, UNIT_LABELS, UNITS } from "#/lib/food";
import { snoozeOptions, type SnoozeOption } from "#/lib/snooze";

export const Route = createFileRoute("/_private/_household/shopping")({
  component: ShoppingPage,
  loader: async ({ context }) => {
    // Opening the list syncs it (idempotent): due/out-of-stock products + the menu window.
    const [{ data }] = await Promise.all([
      syncShoppingList({ throwOnError: true }),
      context.queryClient.ensureQueryData(getProductsOptions()),
    ]);
    context.queryClient.setQueryData(getShoppingItemsQueryKey(), data);
  },
});

function formatQuantity(item: ShoppingItemDto): string | null {
  if (item.quantity == null) return null;
  const unit = item.unit ? ` ${UNIT_LABELS[item.unit]}` : "";
  return `${Number(item.quantity)}${unit}`;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es", { day: "numeric", month: "short" });
}

const UNIT_ITEMS = [
  { label: "Sin unidad", value: "" },
  ...UNITS.map((unit) => ({ label: UNIT_LABELS[unit], value: unit as string })),
];

const CATEGORY_ITEMS = PRODUCT_CATEGORIES.map((c) => ({
  label: PRODUCT_CATEGORY_LABELS[c],
  value: c,
}));
const INTERVAL_ITEMS = [
  { label: "Solo cuando se acabe", value: "" },
  { label: "Cada semana", value: "7" },
  { label: "Cada 2 semanas", value: "14" },
  { label: "Cada mes", value: "30" },
  { label: "Cada 2 meses", value: "60" },
];

const itemNameSchema = z.string().trim().min(1, "Requerido");
const itemQuantitySchema = z
  .string()
  .refine((v) => v.trim() === "" || (!Number.isNaN(Number(v)) && Number(v) > 0), {
    message: "Debe ser mayor a 0",
  });

function ShoppingPage() {
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();
  const shoppingDay = user.householdSettings?.shoppingDay;
  const snoozeChoices = snoozeOptions(shoppingDay);
  const [showForm, setShowForm] = useState(false);

  const listKey = getShoppingItemsOptions().queryKey;
  const { data: items = [], isLoading } = useQuery(getShoppingItemsOptions());
  const { data: products = [] } = useQuery(getProductsOptions());

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: listKey }),
      qc.invalidateQueries({ queryKey: getProductsQueryKey() }),
    ]);

  const syncMut = useMutation({
    ...syncShoppingListMutation(),
    onSuccess: (data) => {
      qc.setQueryData(listKey, data);
      void qc.invalidateQueries({ queryKey: getProductsQueryKey() });
    },
  });
  const createMut = useMutation({ ...createShoppingItemMutation(), onSuccess: refresh });
  const deleteMut = useMutation({
    ...deleteShoppingItemMutation(),
    onSuccess: (_data, variables) => {
      const item = items.find((i) => i.id === variables.path.id);
      if (item?.productStatus === "Due")
        toastManager.add({
          title: `${item.name}: no lo agregaremos en esta compra`,
          description: "Volverá a aparecer en la siguiente.",
        });
      else if (item?.productStatus === "OutOfStock")
        toastManager.add({
          title: `${item.name}: marcado como "sí hay"`,
          description: "Ya no aparece como agotado.",
        });
      return refresh();
    },
  });
  const snoozeMut = useMutation({ ...snoozeProductMutation(), onSuccess: refresh });
  const inStockMut = useMutation({ ...markProductInStockMutation(), onSuccess: refresh });
  const outMut = useMutation({ ...markProductOutOfStockMutation(), onSuccess: refresh });
  const recurringMut = useMutation({ ...makeShoppingItemRecurringMutation(), onSuccess: refresh });

  const toggleMut = useMutation({
    ...setShoppingItemPurchasedMutation(),
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueryData(listKey);
      if (previous) {
        qc.setQueryData(listKey, (data) =>
          produce(data, (draft) => {
            const item = draft?.find((i) => i.id === variables.path.id);
            if (item) item.isPurchased = variables.body.isPurchased;
          }),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(listKey, context.previous);
    },
    onSettled: refresh,
  });

  const form = useAppForm({
    defaultValues: { name: "", quantity: "", unit: null as MeasurementUnit | null },
    onSubmit: async ({ value, formApi }) => {
      await createMut.mutateAsync({
        body: {
          name: value.name.trim(),
          quantity: value.quantity ? Number(value.quantity) : null,
          unit: value.unit,
        },
      });
      formApi.reset();
      setShowForm(false);
    },
  });

  const mutations = [
    syncMut,
    createMut,
    toggleMut,
    deleteMut,
    snoozeMut,
    inStockMut,
    outMut,
    recurringMut,
  ];
  const failed = mutations.find((m) => m.isError);
  const error = failed ? getApiErrorMessage(failed.error) : null;

  const pending = items.filter((i) => !i.isPurchased);
  const purchased = items.filter((i) => i.isPurchased);
  // Without a shopping day the rule only looks at today, so show what's coming to get ahead of it.
  const dueSoon = shoppingDay ? [] : products.filter((p) => p.status === "DueSoon");

  const actions: ItemActions = {
    snoozeChoices,
    onToggle: (item) =>
      toggleMut.mutate({ path: { id: item.id }, body: { isPurchased: !item.isPurchased } }),
    onDelete: (item) => deleteMut.mutate({ path: { id: item.id } }),
    onSnooze: (item, days) =>
      item.productId && snoozeMut.mutate({ path: { id: item.productId }, body: { days } }),
    onInStock: (item) => item.productId && inStockMut.mutate({ path: { id: item.productId } }),
    onMakeRecurring: (item, category, restockIntervalDays) =>
      recurringMut.mutate({ path: { id: item.id }, body: { category, restockIntervalDays } }),
  };

  return (
    <main className="page-wrap px-4 pt-10 pb-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sea-ink">🛒 Lista de compras</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => syncMut.mutate({})} disabled={syncMut.isPending}>
            {syncMut.isPending ? "Actualizando…" : "↻ Actualizar lista"}
          </Button>
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancelar" : "+ Agregar artículo"}
          </Button>
        </div>
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
            <form.AppField name="quantity" validators={{ onChange: itemQuantitySchema }}>
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
      ) : (
        <div className="space-y-6">
          {items.length === 0 ? (
            <div className="island-shell rounded-2xl p-8 text-center">
              <p className="text-4xl">🧺</p>
              <p className="mt-2 text-sm text-sea-ink-soft">
                No hay nada que comprar. Aquí aparecen los productos del hogar cuando toca
                reponerlos o se acaban, y los ingredientes del menú.
              </p>
            </div>
          ) : (
            <>
              <ShoppingSection
                title={`Por comprar (${pending.length})`}
                items={pending}
                actions={actions}
              />
              {purchased.length > 0 && (
                <ShoppingSection
                  title={`Comprado (${purchased.length})`}
                  items={purchased}
                  actions={actions}
                />
              )}
            </>
          )}

          {dueSoon.length > 0 && (
            <DueSoonSection
              products={dueSoon}
              snoozeChoices={snoozeChoices}
              onSnooze={(p, days) => snoozeMut.mutate({ path: { id: p.id }, body: { days } })}
              onOutOfStock={(p) => outMut.mutate({ path: { id: p.id } })}
            />
          )}
        </div>
      )}
    </main>
  );
}

interface ItemActions {
  snoozeChoices: SnoozeOption[];
  onToggle: (item: ShoppingItemDto) => void;
  onDelete: (item: ShoppingItemDto) => void;
  onSnooze: (item: ShoppingItemDto, days: number) => void;
  onInStock: (item: ShoppingItemDto) => void;
  onMakeRecurring: (
    item: ShoppingItemDto,
    category: ProductCategory,
    restockIntervalDays: number | null,
  ) => void;
}

function SourceBadge({ item }: { item: ShoppingItemDto }) {
  // Why it's still to buy; once checked off only the menu origin is worth showing.
  const badge =
    item.isPurchased && item.source !== "MealPlan"
      ? null
      : item.productStatus === "OutOfStock"
        ? { label: "se acabó", className: "bg-red-100 text-red-700" }
        : item.source === "Recurring"
          ? { label: "toca", className: "bg-orange-100 text-orange-800" }
          : item.source === "MealPlan"
            ? { label: "menú", className: "bg-chip-bg text-sea-ink-soft" }
            : null;
  if (!badge) return null;
  return (
    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function deleteLabel(item: ShoppingItemDto): string {
  if (item.isPurchased) return `Quitar ${item.name} de la lista`;
  if (item.source === "MealPlan") return `Ya tengo ${item.name} (no lo agregaremos para este menú)`;
  if (item.productStatus === "Due") return `Saltar ${item.name} en esta compra`;
  if (item.productStatus === "OutOfStock") return `Sí hay ${item.name}`;
  return `Eliminar ${item.name}`;
}

function ShoppingSection({
  title,
  items,
  actions,
}: {
  title: string;
  items: ShoppingItemDto[];
  actions: ItemActions;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-sea-ink-soft uppercase">{title}</h2>
      <ul className="island-shell divide-y divide-line rounded-2xl">
        {items.map((item) => (
          <ShoppingRow key={item.id} item={item} actions={actions} />
        ))}
      </ul>
    </section>
  );
}

type Panel = "snooze" | "recurring" | null;

function ShoppingRow({ item, actions }: { item: ShoppingItemDto; actions: ItemActions }) {
  const [panel, setPanel] = useState<Panel>(null);
  const quantity = formatQuantity(item);
  const pendingItem = !item.isPurchased;
  const canSnooze = pendingItem && item.productStatus === "Due";
  const canMarkInStock = pendingItem && item.productStatus === "OutOfStock";
  const canMakeRecurring = pendingItem && item.source === "Manual" && !item.productId;
  const toggle = (next: Panel) => setPanel((p) => (p === next ? null : next));

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <Checkbox
          checked={item.isPurchased}
          onCheckedChange={() => actions.onToggle(item)}
          aria-label={`Marcar ${item.name} como ${item.isPurchased ? "pendiente" : "comprado"}`}
        />
        <div className="min-w-0 flex-1">
          <span
            className={`text-sm ${item.isPurchased ? "text-sea-ink-soft line-through" : "text-sea-ink"}`}
          >
            {item.name}
          </span>
          {quantity && (
            <span className="ml-2 text-xs whitespace-nowrap text-sea-ink-soft">{quantity}</span>
          )}
          <SourceBadge item={item} />
        </div>
        {canSnooze && (
          <Button variant="ghost" size="sm" onClick={() => toggle("snooze")}>
            Todavía tengo
          </Button>
        )}
        {canMarkInStock && (
          <Button variant="ghost" size="sm" onClick={() => actions.onInStock(item)}>
            Sí hay
          </Button>
        )}
        {canMakeRecurring && (
          <Button variant="ghost" size="sm" onClick={() => toggle("recurring")}>
            Hacer recurrente
          </Button>
        )}
        <Button
          variant="danger-ghost"
          size="sm"
          className="p-2 sm:px-0 sm:py-0"
          onClick={() => actions.onDelete(item)}
          aria-label={deleteLabel(item)}
          title={deleteLabel(item)}
        >
          ✕
        </Button>
      </div>

      {panel === "snooze" && (
        <div className="mt-2 flex flex-wrap gap-2 pl-8">
          {actions.snoozeChoices.map((o) => (
            <Button
              key={o.days}
              variant="outline"
              size="sm"
              onClick={() => {
                actions.onSnooze(item, o.days);
                setPanel(null);
              }}
            >
              {o.label}
            </Button>
          ))}
        </div>
      )}

      {panel === "recurring" && (
        <MakeRecurringForm
          onSubmit={(category, interval) => {
            actions.onMakeRecurring(item, category, interval);
            setPanel(null);
          }}
        />
      )}
    </li>
  );
}

function MakeRecurringForm({
  onSubmit,
}: {
  onSubmit: (category: ProductCategory, restockIntervalDays: number | null) => void;
}) {
  const [category, setCategory] = useState<ProductCategory>("Pantry");
  const [interval, setInterval] = useState("14");

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 pl-8">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-sea-ink-soft">Categoría</span>
        <Select size="sm" items={CATEGORY_ITEMS} value={category} onValueChange={setCategory} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-sea-ink-soft">¿Cada cuánto?</span>
        <Select size="sm" items={INTERVAL_ITEMS} value={interval} onValueChange={setInterval} />
      </label>
      <Button size="sm" onClick={() => onSubmit(category, interval ? Number(interval) : null)}>
        Agregar al catálogo
      </Button>
    </div>
  );
}

function DueSoonSection({
  products,
  snoozeChoices,
  onSnooze,
  onOutOfStock,
}: {
  products: ProductDto[];
  snoozeChoices: SnoozeOption[];
  onSnooze: (product: ProductDto, days: number) => void;
  onOutOfStock: (product: ProductDto) => void;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-sea-ink-soft uppercase">
        Por vencer (7 días) ({products.length})
      </h2>
      <ul className="island-shell divide-y divide-line rounded-2xl">
        {products.map((p) => (
          <li key={p.id} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-sm text-sea-ink">{p.name}</span>
                {p.nextDueOn && (
                  <span className="ml-2 text-xs whitespace-nowrap text-sea-ink-soft">
                    toca el {formatDate(p.nextDueOn)}
                  </span>
                )}
              </div>
              <Button variant="danger" size="sm" onClick={() => onOutOfStock(p)}>
                Se acabó
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-sea-ink-soft">Todavía tengo:</span>
              {snoozeChoices.map((o) => (
                <Button
                  key={o.days}
                  variant="outline"
                  size="sm"
                  onClick={() => onSnooze(p, o.days)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
