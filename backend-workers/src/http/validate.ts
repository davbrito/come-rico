import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";

// Replaces FluentValidation + the MediatR ValidationBehavior. On failure it
// returns the same shape the .NET handler produced:
//   422 { errors: [{ field, message }, ...] }
// so the frontend's error handling is unchanged.

export function validateJson<T extends ZodType>(schema: T) {
  return zValidator("json", schema, (result, c) => {
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.map(String).join("."),
        message: issue.message,
      }));
      return c.json({ errors }, 422);
    }
    return undefined;
  });
}

export function validateQuery<T extends ZodType>(schema: T) {
  return zValidator("query", schema, (result, c) => {
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.map(String).join("."),
        message: issue.message,
      }));
      return c.json({ errors }, 422);
    }
    return undefined;
  });
}
