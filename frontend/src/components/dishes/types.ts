import { z } from "zod";

import type { MeasurementUnit } from "#/api/types.gen";

export type IngredientRow = { name: string; quantity: string; unit: MeasurementUnit };

export const ingredientQuantitySchema = z
  .string()
  .refine((v) => v.trim() === "" || (!Number.isNaN(Number(v)) && Number(v) > 0), {
    message: "Debe ser mayor a 0",
  });

export const SERVINGS_MIN = 1;
export const SERVINGS_MAX = 50;

export const servingsSchema = z
  .string()
  .refine(
    (v) => Number.isInteger(Number(v)) && Number(v) >= SERVINGS_MIN && Number(v) <= SERVINGS_MAX,
    { message: `Entre ${SERVINGS_MIN} y ${SERVINGS_MAX}` },
  );
