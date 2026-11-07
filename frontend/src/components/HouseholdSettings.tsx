import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { updateHouseholdSettingsMutation } from "#/api/@tanstack/react-query.gen";
import type { CurrentUserDto, DayOfWeek } from "#/api/types.gen";
import { Button } from "#/components/ui/Button";
import { Select } from "#/components/ui/Select";
import { getApiErrorMessage } from "#/lib/api";

const NO_DAY = "none";

const DAY_ITEMS: ReadonlyArray<{ label: string; value: DayOfWeek | typeof NO_DAY }> = [
  { label: "Sin día fijo", value: NO_DAY },
  { label: "Lunes", value: "Monday" },
  { label: "Martes", value: "Tuesday" },
  { label: "Miércoles", value: "Wednesday" },
  { label: "Jueves", value: "Thursday" },
  { label: "Viernes", value: "Friday" },
  { label: "Sábado", value: "Saturday" },
  { label: "Domingo", value: "Sunday" },
];

const CURRENCIES = ["USD", "EUR", "VES", "COP", "MXN", "ARS", "CLP", "PEN", "BRL", "GBP", "CAD"];
const CURRENCY_ITEMS = CURRENCIES.map((c) => ({ label: c, value: c }));

function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function timeZoneItems(current: string) {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    // older runtimes: fall back to just the known values
  }
  const all = new Set([...zones, current, deviceTimeZone(), "UTC"]);
  // oxlint-disable-next-line unicorn/no-array-sort -- fresh copy; toSorted is not in the TS lib target
  return [...all].sort((a, b) => a.localeCompare(b)).map((z) => ({ label: z, value: z }));
}

export function HouseholdSettings({
  settings,
  isAdmin,
}: {
  settings: NonNullable<CurrentUserDto["householdSettings"]>;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [day, setDay] = useState<DayOfWeek | typeof NO_DAY>(settings.shoppingDay ?? NO_DAY);
  const [currency, setCurrency] = useState(settings.defaultCurrency);
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  const [zoneItems] = useState(() => timeZoneItems(settings.timeZone));
  const currencyItems = CURRENCIES.includes(currency)
    ? CURRENCY_ITEMS
    : [...CURRENCY_ITEMS, { label: currency, value: currency }];

  const saveMut = useMutation({
    ...updateHouseholdSettingsMutation(),
    onSuccess: () => router.invalidate(),
  });

  const device = deviceTimeZone();
  const dirty =
    day !== (settings.shoppingDay ?? NO_DAY) ||
    currency !== settings.defaultCurrency ||
    timeZone !== settings.timeZone;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveMut.mutate({
          body: {
            shoppingDay: day === NO_DAY ? null : day,
            defaultCurrency: currency,
            timeZone,
          },
        });
      }}
      className="island-shell mt-4 rounded-2xl p-6"
    >
      <h2 className="mb-3 text-base font-semibold text-sea-ink">Configuración</h2>

      {saveMut.isError && (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {getApiErrorMessage(saveMut.error)}
        </p>
      )}

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-sea-ink-soft">Día de compra</span>
          <Select items={DAY_ITEMS} value={day} onValueChange={setDay} disabled={!isAdmin} />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-sea-ink-soft">Moneda</span>
          <Select
            items={currencyItems}
            value={currency}
            onValueChange={setCurrency}
            disabled={!isAdmin}
          />
        </label>

        <div>
          <span className="mb-1 block text-xs font-semibold text-sea-ink-soft">Zona horaria</span>
          <Select
            items={zoneItems}
            value={timeZone}
            onValueChange={setTimeZone}
            disabled={!isAdmin}
          />
          {isAdmin && timeZone !== device && (
            <Button
              type="button"
              variant="ghost"
              className="mt-1 px-0 text-xs"
              onClick={() => setTimeZone(device)}
            >
              Usar la de este dispositivo ({device})
            </Button>
          )}
        </div>
      </div>

      {isAdmin ? (
        <Button type="submit" disabled={!dirty || saveMut.isPending} className="mt-4 w-full">
          {saveMut.isPending
            ? "Guardando…"
            : saveMut.isSuccess && !dirty
              ? "Guardado ✓"
              : "Guardar"}
        </Button>
      ) : (
        <p className="mt-3 text-xs text-sea-ink-soft">
          Solo los administradores pueden cambiar la configuración.
        </p>
      )}
    </form>
  );
}
