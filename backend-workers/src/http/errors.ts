import type { Context } from "hono";
import type { AppEnv } from "../context";

// HTTP-mapped errors, mirroring the .NET global exception handler:
//   ValidationException      → 422 { errors: [{ field, message }] }
//   InvalidOperationException → 400 { message }
//   everything else           → 500 { message: "<Spanish fallback>" }

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

/** Business-rule violation (invalid invite code, already in a household, …). Maps to 400, like InvalidOperationException. */
export class BusinessError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

/** Authorization failure (e.g. non-admin action). Maps to 403. */
export class ForbiddenError extends HttpError {
  constructor(message: string) {
    super(403, message);
  }
}

/** Resource not found. Maps to 404. */
export class NotFoundError extends HttpError {
  constructor(message = "No encontrado.") {
    super(404, message);
  }
}

const INTERNAL_MESSAGE = "Ocurrió un error interno. Por favor inténtelo de nuevo.";

export function registerErrorHandler(app: { onError: (h: (err: Error, c: Context<AppEnv>) => Response) => void }) {
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ message: err.message }, err.status);
    }
    console.error("Unhandled error:", err);
    return c.json({ message: INTERNAL_MESSAGE }, 500);
  });
}
