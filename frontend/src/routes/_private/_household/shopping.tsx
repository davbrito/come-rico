import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { produce } from "immer";
import { useState } from "react";
import { z } from "zod";

import {
  checkoutMutation,
  createShoppingItemMutation,
  deleteShoppingItemMutation,
  getLatestShoppingTripOptions,
  getLatestShoppingTripQueryKey,
  getProductsOptions,
  getProductsQueryKey,
  getShoppingItemsOptions,
  getShoppingItemsQueryKey,
  makeShoppingItemRecurringMutation,
  markProductInStockMutation,
  markProductOutOfStockMutation,
  setShoppingItemInCartMutation,
  setShoppingItemQuantityMutation,
  snoozeProductMutation,
  syncShoppingListMutation,
  undoCheckoutMutation,
} from "#/api/@tanstack/react-query.gen";
import { syncShoppingList } from "#/api/sdk.gen";
import type {
  MeasurementUnit,
  ProductCategory,
  ProductDto,
  ShoppingItemDto,
  ShoppingTripDto,
} from "#/api/types.gen";
import { useAppForm } from "#/components/form";
import { Button } from "#/components/ui/Button";
import { Checkbox } from "#/components/ui/Checkbox";
import { ConfirmDialog } from "#/components/ui/ConfirmDialog";
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

function formatTime(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString("es", { hour: "numeric", minute: "2-digit" });
  return sameDay
    ? `hoy a las ${time}`
    : `${d.toLocaleDateString("es", { weekday: "long", day: "numeric" })} a las ${time}`;
}

function formatMoney(money: ShoppingTripDto["totalPaid"]): string | null {
  if (!money) return null;
  return new Intl.NumberFormat("es", { style: "currency", currency: money.currency }).format(
    Number(money.amount),
  );
}

const HOUR = 60 * 60 * 1000;
/** A cart older than this gets a "¿confirmar la compra?" reminder (it never checks out by itself). */
const FORGOTTEN_CART_MS = 12 * HOUR;
/** "Deshacer la última compra" is offered for a day; the API allows it later too. */
const UNDO_WINDOW_MS = 24 * HOUR;
/** While something is in the cart, poll so a shared cart shows what the others took. */
const CART_POLL_MS = 5000;

const MENU_GROUP = "Comida de la semana";
const OTHER_GROUP = "Otros";
// The "Other" product category is also labelled "Otros": a Set merges it with loose manual items.
const GROUP_ORDER = [
  ...new Set([
    ...PRODUCT_CATEGORIES.filter((c) => c !== "Other").map((c) => PRODUCT_CATEGORY_LABELS[c]),
    MENU_GROUP,
    OTHER_GROUP,
    PRODUCT_CATEGORY_LABELS.Other,
  ]),
];

function groupOf(item: ShoppingItemDto): string {
  if (item.category) return PRODUCT_CATEGORY_LABELS[item.category];
  return item.source === "MealPlan" ? MENU_GROUP : OTHER_GROUP;
}

/** Grouped by category; within each group what's still to grab first, the cart (crossed out) last. */
function groupItems(items: ShoppingItemDto[]) {
  const groups = new Map<string, ShoppingItemDto[]>();
  for (const item of items) {
    const key = groupOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return GROUP_ORDER.filter((g) => groups.has(g)).map((title) => ({
    title,
    // oxlint-disable-next-line unicorn/no-array-sort -- fresh copy; toSorted is not in the TS lib target
    items: [...(groups.get(title) ?? [])].sort(
      (a, b) =>
        Number(a.status === "InCart") - Number(b.status === "InCart") ||
        a.name.localeCompare(b.name),
    ),
  }));
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
  const currency = user.householdSettings?.defaultCurrency ?? "USD";
  const snoozeChoices = snoozeOptions(shoppingDay);
  const [showForm, setShowForm] = useState(false);
  const [addToCart, setAddToCart] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [undoing, setUndoing] = useState<ShoppingTripDto | null>(null);
  const [now] = useState(() => Date.now());

  const listKey = getShoppingItemsOptions().queryKey;
  const { data: items = [], isLoading } = useQuery({
    ...getShoppingItemsOptions(),
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.some((i) => i.status === "InCart") ? CART_POLL_MS : false,
  });
  const { data: products = [] } = useQuery(getProductsOptions());
  const { data: latestTrip } = useQuery(getLatestShoppingTripOptions());

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: listKey }),
      qc.invalidateQueries({ queryKey: getProductsQueryKey() }),
      qc.invalidateQueries({ queryKey: getLatestShoppingTripQueryKey() }),
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
  const quantityMut = useMutation({ ...setShoppingItemQuantityMutation(), onSuccess: refresh });

  // Checks at the store are optimistic and survive a dead zone: offlineFirst pauses the request while
  // there's no network and sends it when it's back. They have no side effects, so retrying is safe.
  const cartMut = useMutation({
    ...setShoppingItemInCartMutation(),
    networkMode: "offlineFirst",
    retry: 3,
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueryData(listKey);
      if (previous) {
        qc.setQueryData(listKey, (data) =>
          produce(data, (draft) => {
            const item = draft?.find((i) => i.id === variables.path.id);
            if (!item) return;
            item.status = variables.body.inCart ? "InCart" : "Pending";
            item.inCartByUserId = variables.body.inCart ? user.id : null;
            item.inCartByName = variables.body.inCart ? user.displayName : null;
            item.inCartAt = variables.body.inCart ? new Date().toISOString() : null;
          }),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(listKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: listKey }),
  });

  // Checkout needs the network: it's the transaction that records the purchase.
  const checkoutMut = useMutation({
    ...checkoutMutation(),
    onSuccess: (trip) => {
      setCheckingOut(false);
      toastManager.add({
        title: "Compra registrada",
        description: `${trip.itemCount} artículo(s). Puedes deshacerla si fue un error.`,
      });
      return refresh();
    },
  });
  const undoMut = useMutation({
    ...undoCheckoutMutation(),
    onSuccess: () => {
      setUndoing(null);
      toastManager.add({
        title: "Compra deshecha",
        description: "Sus artículos volvieron al carrito.",
      });
      return refresh();
    },
  });

  const form = useAppForm({
    defaultValues: { name: "", quantity: "", unit: null as MeasurementUnit | null },
    onSubmit: async ({ value, formApi }) => {
      await createMut.mutateAsync({
        body: {
          name: value.name.trim(),
          quantity: value.quantity ? Number(value.quantity) : null,
          unit: value.unit,
          inCart: addToCart,
        },
      });
      formApi.reset();
      setAddToCart(false);
      setShowForm(false);
    },
  });

  const mutations = [
    syncMut,
    createMut,
    cartMut,
    deleteMut,
    snoozeMut,
    inStockMut,
    outMut,
    recurringMut,
    quantityMut,
    checkoutMut,
    undoMut,
  ];
  const failed = mutations.find((m) => m.isError);
  const error = failed ? getApiErrorMessage(failed.error) : null;

  const cart = items.filter((i) => i.status === "InCart");
  const toGrab = items.length - cart.length;
  const oldestInCart = cart
    .map((i) => (i.inCartAt ? Date.parse(i.inCartAt) : now))
    .reduce((a, b) => Math.min(a, b), now);
  const forgottenCart = cart.length > 0 && now - oldestInCart > FORGOTTEN_CART_MS;
  const undoableTrip =
    latestTrip?.id && now - Date.parse(latestTrip.completedAt) < UNDO_WINDOW_MS ? latestTrip : null;
  // Without a shopping day the rule only looks at today, so show what's coming to get ahead of it.
  const dueSoon = shoppingDay ? [] : products.filter((p) => p.status === "DueSoon");

  const actions: ItemActions = {
    snoozeChoices,
    me: user.id,
    onToggleCart: (item) =>
      cartMut.mutate({ path: { id: item.id }, body: { inCart: item.status !== "InCart" } }),
    onQuantity: (item, quantity) =>
      quantityMut.mutate({ path: { id: item.id }, body: { quantity } }),
    onDelete: (item) => deleteMut.mutate({ path: { id: item.id } }),
    onSnooze: (item, days) =>
      item.productId && snoozeMut.mutate({ path: { id: item.productId }, body: { days } }),
    onInStock: (item) => item.productId && inStockMut.mutate({ path: { id: item.productId } }),
    onMakeRecurring: (item, category, restockIntervalDays) =>
      recurringMut.mutate({ path: { id: item.id }, body: { category, restockIntervalDays } }),
  };

  return (
    <main className={`page-wrap px-4 pt-10 ${cart.length > 0 ? "pb-28" : "pb-8"}`}>
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

      {forgottenCart && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-900 dark:bg-orange-900/20 dark:text-orange-200">
          <span className="flex-1">
            Tienes {cart.length} {cart.length === 1 ? "cosa" : "cosas"} en el carrito desde{" "}
            {formatTime(new Date(oldestInCart).toISOString())}. ¿Confirmas la compra?
          </span>
          <Button size="sm" onClick={() => setCheckingOut(true)}>
            Terminar compra
          </Button>
        </div>
      )}

      {undoableTrip && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-chip-bg px-4 py-3 text-sm text-sea-ink-soft">
          <span className="flex-1">
            Última compra {formatTime(undoableTrip.completedAt)} · {undoableTrip.itemCount}{" "}
            artículo(s)
            {undoableTrip.store && ` · ${undoableTrip.store}`}
            {undoableTrip.totalPaid && ` · ${formatMoney(undoableTrip.totalPaid)}`}
          </span>
          <Button variant="link" size="sm" onClick={() => setUndoing(undoableTrip)}>
            Deshacer
          </Button>
        </div>
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
          <label className="mt-3 flex items-center gap-2 text-sm text-sea-ink">
            <Checkbox checked={addToCart} onCheckedChange={(v) => setAddToCart(Boolean(v))} />
            Ya lo eché al carrito (no estaba en la lista)
          </label>
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
              <p className="text-xs text-sea-ink-soft">
                Marca lo que vas echando al carrito: no cuenta como comprado hasta que termines la
                compra. {toGrab} por tomar · {cart.length} en el carrito.
              </p>
              {groupItems(items).map((group) => (
                <ShoppingSection
                  key={group.title}
                  title={`${group.title} (${group.items.length})`}
                  items={group.items}
                  actions={actions}
                />
              ))}
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

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <Button size="lg" className="shadow-lg" onClick={() => setCheckingOut(true)}>
            Terminar compra · {cart.length} en el carrito
          </Button>
        </div>
      )}

      <CheckoutDialog
        open={checkingOut}
        onOpenChange={setCheckingOut}
        cart={cart}
        pendingCount={toGrab}
        currency={currency}
        isPending={checkoutMut.isPending}
        error={checkoutMut.isError ? getApiErrorMessage(checkoutMut.error) : null}
        onConfirm={(store, totalPaid) => checkoutMut.mutate({ body: { store, totalPaid } })}
      />

      <ConfirmDialog
        open={undoing !== null}
        onOpenChange={(open) => !open && setUndoing(null)}
        title="¿Deshacer la última compra?"
        description="Sus artículos vuelven al carrito y los productos recuperan su última compra anterior."
        confirmLabel="Deshacer compra"
        onConfirm={() => undoing && undoMut.mutate({ path: { id: undoing.id } })}
      />
    </main>
  );
}

interface ItemActions {
  snoozeChoices: SnoozeOption[];
  /** Current user's id, to say "lo tomó Ana" only for someone else. */
  me: string;
  onToggleCart: (item: ShoppingItemDto) => void;
  onQuantity: (item: ShoppingItemDto, quantity: number | null) => void;
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
  // Why it's on the list; once in the cart only the menu origin is worth showing.
  const badge =
    item.status === "InCart" && item.source !== "MealPlan"
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
  const inCart = item.status === "InCart";
  const canSnooze = !inCart && item.productStatus === "Due";
  const canMarkInStock = !inCart && item.productStatus === "OutOfStock";
  const canMakeRecurring = item.source === "Manual" && !item.productId;
  const toggle = (next: Panel) => setPanel((p) => (p === next ? null : next));
  const takenBy =
    inCart && item.inCartByName && item.inCartByUserId !== actions.me
      ? `lo tomó ${item.inCartByName}`
      : null;

  return (
    <li className={`px-4 py-3 ${inCart ? "bg-chip-bg/50" : ""}`}>
      <div className="flex items-center gap-3">
        <Checkbox
          checked={inCart}
          onCheckedChange={() => actions.onToggleCart(item)}
          aria-label={inCart ? `Sacar ${item.name} del carrito` : `Echar ${item.name} al carrito`}
        />
        <div className="min-w-0 flex-1">
          <span className={`text-sm ${inCart ? "text-sea-ink-soft line-through" : "text-sea-ink"}`}>
            {item.name}
          </span>
          <QuantityEditor item={item} onSave={(q) => actions.onQuantity(item, q)} />
          <SourceBadge item={item} />
          {takenBy && <span className="ml-2 text-xs text-sea-ink-soft italic">{takenBy}</span>}
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

/** "Eché 2": tap the quantity to change it. */
function QuantityEditor({
  item,
  onSave,
}: {
  item: ShoppingItemDto;
  onSave: (quantity: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const label = formatQuantity(item);
  const unit = item.unit ? UNIT_LABELS[item.unit] : "";

  if (!editing)
    return (
      <button
        type="button"
        className="ml-2 cursor-pointer text-xs whitespace-nowrap text-sea-ink-soft underline decoration-dotted underline-offset-2"
        onClick={() => {
          setValue(item.quantity == null ? "" : String(Number(item.quantity)));
          setEditing(true);
        }}
        aria-label={`Cambiar la cantidad de ${item.name}`}
      >
        {label ?? "cant."}
      </button>
    );

  const save = () => {
    setEditing(false);
    const next = value.trim() === "" ? null : Number(value);
    if (next !== null && !(next > 0)) return;
    if (next !== (item.quantity == null ? null : Number(item.quantity))) onSave(next);
  };

  return (
    <span className="ml-2 inline-flex items-center gap-1">
      <input
        type="number"
        min="0"
        step="any"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-16 rounded-md border border-line bg-transparent px-1.5 py-0.5 text-xs text-sea-ink"
        aria-label={`Cantidad de ${item.name}`}
      />
      {unit && <span className="text-xs text-sea-ink-soft">{unit}</span>}
    </span>
  );
}

function CheckoutDialog({
  open,
  onOpenChange,
  cart,
  pendingCount,
  currency,
  isPending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: ShoppingItemDto[];
  pendingCount: number;
  currency: string;
  isPending: boolean;
  error: string | null;
  onConfirm: (store: string | null, totalPaid: number | null) => void;
}) {
  const [store, setStore] = useState("");
  const [total, setTotal] = useState("");
  const totalValue = total.trim() === "" ? null : Number(total);
  const totalInvalid = totalValue !== null && !(totalValue > 0);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="island-shell fixed top-1/2 left-1/2 z-50 max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-6 transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          <Dialog.Title className="text-base font-semibold text-sea-ink">
            Terminar compra
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-sea-ink-soft">
            Se registra como comprado lo que está en el carrito ({cart.length}).
            {pendingCount > 0 &&
              ` Lo que no tomaste (${pendingCount}) se queda en la lista para la próxima.`}
          </Dialog.Description>

          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm text-sea-ink">
            {cart.map((i) => (
              <li key={i.id}>
                ✓ {i.name}
                {formatQuantity(i) && (
                  <span className="ml-1 text-xs text-sea-ink-soft">{formatQuantity(i)}</span>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-sea-ink-soft">
                Tienda (opcional)
              </span>
              <input
                value={store}
                maxLength={100}
                onChange={(e) => setStore(e.target.value)}
                className="w-full rounded-xl border border-line bg-[var(--chip-bg)] px-3 py-2 text-sm text-sea-ink"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-sea-ink-soft">
                Total pagado ({currency}, opcional)
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                className="w-full rounded-xl border border-line bg-[var(--chip-bg)] px-3 py-2 text-sm text-sea-ink"
              />
            </label>
          </div>

          {(error || totalInvalid) && (
            <p className="mt-3 text-xs text-red-500">
              {totalInvalid ? "El total debe ser mayor que cero." : error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close render={<Button variant="outline" size="sm" />}>Cancelar</Dialog.Close>
            <Button
              size="sm"
              disabled={isPending || totalInvalid || cart.length === 0}
              onClick={() => onConfirm(store.trim() || null, totalValue)}
            >
              {isPending ? "Guardando…" : "Pagué"}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
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
