import { OpenAPIHono, type z } from "@hono/zod-openapi";
import type { AppEnv } from "../context";
import { ErrorResponse, ValidationErrorResponse } from "./schemas";

// OpenAPIHono app pre-wired with the validation hook that reproduces the .NET
// 422 body shape: { errors: [{ field, message }] }. Used for the root app and
// every route module so behavior is uniform.
export function createApp() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
          field: issue.path.map(String).join("."),
          message: issue.message,
        }));
        return c.json({ errors }, 422);
      }
      return undefined;
    },
  });
}

// Response-object builders for createRoute definitions.
export const jsonResponse = (schema: z.ZodType, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

export const emptyResponse = (description: string) => ({ description });

/** Standard error responses reused across routes. */
export const errors = {
  validation: jsonResponse(ValidationErrorResponse, "Datos inválidos"),
  unauthorized: jsonResponse(ErrorResponse, "No autenticado"),
  forbidden: jsonResponse(ErrorResponse, "Prohibido"),
  notFound: jsonResponse(ErrorResponse, "No encontrado"),
  badRequest: jsonResponse(ErrorResponse, "Error de solicitud"),
};
