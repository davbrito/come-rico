import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  createProductMutation,
  deleteProductMutation,
  getProductsOptions,
  getProductsQueryKey,
  markProductInStockMutation,
  markProductOutOfStockMutation,
  snoozeProductMutation,
  updateProductMutation,
} from "#/api/@tanstack/react-query.gen";
import type {
  MeasurementUnit,
  ProductCategory,
  ProductDto,
  ProductRequest,
  RestockStatus,
} from "#/api/types.gen";
import { useAppForm } from "#/components/form";
import { Button } from "#/components/ui/Button";
import { ConfirmDialog } from "#/components/ui/ConfirmDialog";
import { getApiErrorMessage } from "#/lib/api";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS, UNIT_LABELS, UNITS } from "#/lib/food";

export const Route = createFileRoute("/_private/_household/products")({
  component: ProductsPage,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(getProductsOptions());
  },
});

const CATEGORY_ITEMS = PRODUCT_CATEGORIES.map((c) => ({
  label: PRODUCT_CATEGORY_LABELS[c],
  value: c as string,
}));
const UNIT_ITEMS = [
  { label: "Sin unidad", value: "" },
  ...UNITS.map((u) => ({ label: UNIT_LABELS[u], value: u as string })),
];

const CUSTOM = "custom";
const INTERVAL_ITEMS = [
  { label: "Sin recurrencia (solo si se acaba)", value: "" },
  { label: "Cada semana", value: "7" },
  { label: "Cada 2 semanas", value: "14" },
  { label: "Cada mes", value: "30" },
  { label: "Cada 2 meses", value: "60" },
  { label: "Personalizado…", value: CUSTOM },
];
const PRESET_DAYS = new Set(["7", "14", "30", "60"]);

const SNOOZE_OPTIONS = [
  { label: "+3 días", days: 3 },
  { label: "+1 semana", days: 7 },
  { label: "+2 semanas", days: 14 },
];

const STATUS_LABELS: Record<RestockStatus, { label: string; className: string } | null> = {
  Ok: null,
  DueSoon: { label: "Por vencer", className: "bg-chip-bg text-sea-ink-soft" },
  Due: { label: "Toca comprar", className: "bg-orange-100 text-orange-800" },
  OutOfStock: { label: "Se acabó", className: "bg-red-100 text-red-700" },
};

const toNumber = (v: number | string | null): number | null => (v == null ? null : Number(v));

function intervalPreset(days: number | null): string {
  if (days == null) return "";
  return PRESET_DAYS.has(String(days)) ? String(days) : CUSTOM;
}

function describeInterval(days: number | null): string {
  if (days == null) return "Sin recurrencia";
  if (days % 30 === 0 && days >= 30)
    return `Cada ${days / 30 === 1 ? "mes" : `${days / 30} meses`}`;
  if (days % 7 === 0) return `Cada ${days / 7 === 1 ? "semana" : `${days / 7} semanas`}`;
  return `Cada ${days} días`;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es", { day: "numeric", month: "short" });
}

function ProductsPage() {
  const qc = useQueryClient();
  const [formFor, setFormFor] = useState<ProductDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<ProductDto | null>(null);

  const { data: products = [], isLoading } = useQuery(getProductsOptions());
  const invalidate = () => qc.invalidateQueries({ queryKey: getProductsQueryKey() });

  const outMut = useMutation({ ...markProductOutOfStockMutation(), onSuccess: invalidate });
  const inMut = useMutation({ ...markProductInStockMutation(), onSuccess: invalidate });
  const snoozeMut = useMutation({ ...snoozeProductMutation(), onSuccess: invalidate });
  const deleteMut = useMutation({ ...deleteProductMutation(), onSuccess: invalidate });

  const error =
    (outMut.isError && getApiErrorMessage(outMut.error)) ||
    (inMut.isError && getApiErrorMessage(inMut.error)) ||
    (snoozeMut.isError && getApiErrorMessage(snoozeMut.error)) ||
    (deleteMut.isError && getApiErrorMessage(deleteMut.error)) ||
    null;

  return (
    <main className="page-wrap px-4 pt-10 pb-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-sea-ink">🧴 Productos del hogar</h1>
        <Button onClick={() => setFormFor(formFor ? null : "new")}>
          {formFor ? "Cancelar" : "+ Agregar producto"}
        </Button>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      {formFor && (
        <ProductForm
          key={formFor === "new" ? "new" : formFor.id}
          product={formFor === "new" ? null : formFor}
          onSaved={() => {
            invalidate();
            setFormFor(null);
          }}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-sea-ink-soft">Cargando productos…</p>
      ) : products.length === 0 ? (
        <div className="island-shell rounded-2xl p-8 text-center">
          <p className="text-4xl">🧺</p>
          <p className="mt-2 text-sm text-sea-ink-soft">
            Aún no hay productos. Agrega lo que compras seguido (shampoo, papel de baño, arroz…) y
            te avisaremos cuándo toca comprarlo.
          </p>
        </div>
      ) : (
        <ul className="island-shell divide-y divide-line rounded-2xl">
          {products.map((p) => {
            const badge = STATUS_LABELS[p.status];
            const qty = toNumber(p.defaultQuantity);
            return (
              <li key={p.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-sea-ink">{p.name}</span>
                  {badge && (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${badge.className}`}>
                      {badge.label}
                    </span>
                  )}
                  <span className="rounded-full bg-chip-bg px-2 py-0.5 text-xs text-sea-ink-soft">
                    {PRODUCT_CATEGORY_LABELS[p.category]}
                  </span>
                  <span className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => setFormFor(p)}>
                    Editar
                  </Button>
                  <Button
                    variant="danger-ghost"
                    size="sm"
                    onClick={() => setDeleting(p)}
                    aria-label={`Eliminar ${p.name}`}
                  >
                    ✕
                  </Button>
                </div>
                <p className="text-xs text-sea-ink-soft">
                  {[
                    qty != null
                      ? `${qty}${p.defaultUnit ? ` ${UNIT_LABELS[p.defaultUnit]}` : ""}`
                      : null,
                    describeInterval(toNumber(p.restockIntervalDays)),
                    p.preferredBrand,
                    p.lastPurchasedOn
                      ? `Última compra: ${formatDate(p.lastPurchasedOn)}`
                      : "Sin compra registrada",
                    p.nextDueOn ? `Toca: ${formatDate(p.nextDueOn)}` : null,
                    p.snoozedUntil ? `Pospuesto hasta ${formatDate(p.snoozedUntil)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {p.status === "OutOfStock" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => inMut.mutate({ path: { id: p.id } })}
                    >
                      Sí hay
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => outMut.mutate({ path: { id: p.id } })}
                      >
                        Se acabó
                      </Button>
                      {(p.status === "Due" || p.status === "DueSoon") &&
                        SNOOZE_OPTIONS.map((o) => (
                          <Button
                            key={o.days}
                            variant="outline"
                            size="sm"
                            title="Todavía tengo"
                            onClick={() =>
                              snoozeMut.mutate({ path: { id: p.id }, body: { days: o.days } })
                            }
                          >
                            Todavía tengo {o.label}
                          </Button>
                        ))}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Eliminar producto"
        description={`¿Eliminar "${deleting?.name ?? ""}"? Su historial se conserva.`}
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (deleting) deleteMut.mutate({ path: { id: deleting.id } });
          setDeleting(null);
        }}
      />
    </main>
  );
}

function ProductForm({ product, onSaved }: { product: ProductDto | null; onSaved: () => void }) {
  const createMut = useMutation(createProductMutation());
  const updateMut = useMutation(updateProductMutation());
  const mut = product ? updateMut : createMut;

  const form = useAppForm({
    defaultValues: {
      name: product?.name ?? "",
      category: (product?.category ?? "Pantry") as string,
      quantity: product?.defaultQuantity != null ? String(product.defaultQuantity) : "1",
      unit: (product?.defaultUnit ?? "Package") as string,
      interval: intervalPreset(toNumber(product?.restockIntervalDays ?? null)),
      customDays:
        product?.restockIntervalDays != null &&
        intervalPreset(toNumber(product.restockIntervalDays)) === CUSTOM
          ? String(product.restockIntervalDays)
          : "",
      brand: product?.preferredBrand ?? "",
      lastPurchasedOn: product?.lastPurchasedOn ?? "",
    },
    onSubmit: async ({ value }) => {
      const days =
        value.interval === ""
          ? null
          : Number(value.interval === CUSTOM ? value.customDays : value.interval);
      const body: ProductRequest = {
        name: value.name.trim(),
        category: value.category as ProductCategory,
        defaultQuantity: value.quantity ? Number(value.quantity) : null,
        defaultUnit: (value.unit || null) as MeasurementUnit | null,
        restockIntervalDays: days,
        preferredBrand: value.brand.trim() || null,
        lastPurchasedOn: value.lastPurchasedOn || null,
      };
      if (product) await updateMut.mutateAsync({ path: { id: product.id }, body });
      else await createMut.mutateAsync({ body });
      onSaved();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="island-shell mb-6 rounded-2xl p-6"
    >
      <h2 className="mb-4 text-base font-semibold text-sea-ink">
        {product ? `Editar ${product.name}` : "Nuevo producto"}
      </h2>
      {mut.isError && <p className="mb-3 text-sm text-red-600">{getApiErrorMessage(mut.error)}</p>}
      <div className="flex flex-wrap gap-3">
        <form.AppField
          name="name"
          validators={{ onChange: ({ value }) => (value.trim() ? undefined : "Requerido") }}
        >
          {(field) => <field.TextField label="Nombre *" required className="min-w-48 flex-1" />}
        </form.AppField>
        <form.AppField name="category">
          {(field) => (
            <field.SelectField label="Categoría" items={CATEGORY_ITEMS} className="w-40" />
          )}
        </form.AppField>
        <form.AppField
          name="quantity"
          validators={{
            onChange: ({ value }) =>
              value === "" || Number(value) > 0 ? undefined : "Debe ser mayor a 0",
          }}
        >
          {(field) => (
            <field.TextField label="Cantidad" type="number" min="0" step="any" className="w-28" />
          )}
        </form.AppField>
        <form.AppField name="unit">
          {(field) => <field.SelectField label="Unidad" items={UNIT_ITEMS} className="w-32" />}
        </form.AppField>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <form.AppField name="interval">
          {(field) => (
            <field.SelectField label="¿Cada cuánto?" items={INTERVAL_ITEMS} className="w-64" />
          )}
        </form.AppField>
        <form.Subscribe selector={(s) => s.values.interval}>
          {(interval) =>
            interval === CUSTOM && (
              <form.AppField
                name="customDays"
                validators={{
                  onChange: ({ value }) =>
                    Number.isInteger(Number(value)) && Number(value) >= 2
                      ? undefined
                      : "Días (entero ≥ 2)",
                }}
              >
                {(field) => (
                  <field.TextField label="Cada (días)" type="number" min="2" className="w-28" />
                )}
              </form.AppField>
            )
          }
        </form.Subscribe>
        <form.AppField name="brand">
          {(field) => <field.TextField label="Marca preferida" className="w-48" />}
        </form.AppField>
        <form.AppField name="lastPurchasedOn">
          {(field) => (
            <field.TextField
              label="¿Cuándo lo compraste por última vez?"
              type="date"
              className="w-64"
            />
          )}
        </form.AppField>
      </div>
      <div className="mt-4">
        <form.AppForm>
          <form.SubmitButton className="px-5">Guardar</form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}
