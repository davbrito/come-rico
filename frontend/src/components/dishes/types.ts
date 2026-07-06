import { z } from "zod";

import type { MeasurementUnit } from "#/api/types.gen";

export type IngredientRow = { name: string; amount: string; unit: MeasurementUnit };

export const ingredientAmountSchema = z
  .string()
  .refine((v) => v.trim() === "" || (!Number.isNaN(Number(v)) && Number(v) > 0), {
    message: "Debe ser mayor a 0",
  });
