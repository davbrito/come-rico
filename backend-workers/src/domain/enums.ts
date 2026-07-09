// Single source of truth for the domain enum values. The Drizzle schema builds
// its pgEnums from these, and features import them (e.g. for Zod validation)
// without reaching into db/schema (which the isolation lint rule forbids).
//
// Values are PascalCase to match what the .NET API emitted, so the frontend's
// string-literal unions are unchanged.

export const HOUSEHOLD_ROLES = ["Member", "Admin"] as const;
export const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner"] as const;
export const MEASUREMENT_UNITS = [
  "Piece",
  "Gram",
  "Kilogram",
  "Milliliter",
  "Liter",
  "Cup",
  "Tablespoon",
  "Teaspoon",
] as const;
export const ROULETTE_STATUSES = ["Pending", "Spinning", "Completed", "Cancelled"] as const;
export const STORED_FILE_STATUSES = ["Pending", "Active", "Orphaned"] as const;

export type HouseholdRoleValue = (typeof HOUSEHOLD_ROLES)[number];
export type MealTypeValue = (typeof MEAL_TYPES)[number];
export type MeasurementUnitValue = (typeof MEASUREMENT_UNITS)[number];
export type RouletteStatusValue = (typeof ROULETTE_STATUSES)[number];
export type StoredFileStatusValue = (typeof STORED_FILE_STATUSES)[number];
