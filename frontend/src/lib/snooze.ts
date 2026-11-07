import type { DayOfWeek } from "#/api/types.gen";

export interface SnoozeOption {
  label: string;
  days: number;
}

/**
 * "Todavía tengo" options (spike 3.1.0). With a shopping day the backend stretches any snooze past the
 * next trip, so 1 day means "Saltar esta compra"; without one the shortest option is +3 días.
 */
export function snoozeOptions(shoppingDay: DayOfWeek | null | undefined): SnoozeOption[] {
  const first = shoppingDay
    ? { label: "Saltar esta compra", days: 1 }
    : { label: "+3 días", days: 3 };
  return [first, { label: "+1 semana", days: 7 }, { label: "+2 semanas", days: 14 }];
}
