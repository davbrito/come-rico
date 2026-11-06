import type { MealType, MeasurementUnit, ProductCategory } from "#/api/types.gen";

export const MEAL_TYPES: MealType[] = ["Breakfast", "Lunch", "Dinner"];

export const MEAL_LABELS: Record<MealType, string> = {
  Breakfast: "Desayuno",
  Lunch: "Almuerzo",
  Dinner: "Cena",
};

export const UNITS: MeasurementUnit[] = [
  "Piece",
  "Gram",
  "Kilogram",
  "Milliliter",
  "Liter",
  "Cup",
  "Tablespoon",
  "Teaspoon",
  "Package",
];

export const UNIT_LABELS: Record<MeasurementUnit, string> = {
  Piece: "pz",
  Gram: "g",
  Kilogram: "kg",
  Milliliter: "ml",
  Liter: "L",
  Cup: "taza(s)",
  Tablespoon: "cda",
  Teaspoon: "cdta",
  Package: "paq.",
};

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  "Hygiene",
  "Cleaning",
  "Pantry",
  "Fresh",
  "Baby",
  "Pets",
  "Other",
];

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  Hygiene: "Higiene",
  Cleaning: "Limpieza",
  Pantry: "Despensa",
  Fresh: "Frescos",
  Baby: "Bebés",
  Pets: "Mascotas",
  Other: "Otros",
};

/** yyyy-MM-dd of the local date (avoids the UTC shift of toISOString). */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Monday of the week containing the given date. */
export function getMonday(date: Date): Date {
  const result = new Date(date);
  const daysSinceMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
}
