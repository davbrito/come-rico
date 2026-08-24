import axios, { isAxiosError } from "axios";

import type { CreateClientConfig } from "#/api/client";

// The API is a separate origin now (a Lambda Function URL, not something
// same-origin behind a Vercel rewrite) — the client build needs its own
// copy of the backend URL since import.meta.env.VITE_* is inlined at
// build time and process.env isn't available in the browser bundle.

axios.defaults.adapter = "fetch";
axios.defaults.baseURL = import.meta.env.PUBLIC_BACKEND_URL || "http://localhost:5276";
// Cross-origin requests need this for the browser to send/accept the
// auth cookie — the API's CORS policy (Program.cs) allows it explicitly
// per origin with AllowCredentials(), matching this.
axios.defaults.withCredentials = true;

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  axios,
});

export interface ErrorMetadata {
  /** Human-readable error message. */
  message: string;
  /** HTTP status code, when the error came from an API response. */
  status?: number;
  /** Structured validation errors, when present. */
  details?: Record<string, string[]>;
}

/**
 * Extract structured metadata from any error value.
 *
 * Handles Axios errors (digging into `response.data`), standard `Error`
 * instances, plain objects with a `message` or `errors` field, strings,
 * and unknown types — always returning a safe fallback message.
 */
export function extractErrorMetadata(err: unknown): ErrorMetadata {
  if (isAxiosError(err)) {
    const data = err.response?.data as Record<string, unknown> | undefined;
    const details =
      typeof data?.errors === "object" && data.errors !== null
        ? (data.errors as Record<string, string[]>)
        : undefined;

    const detailsMessage = details ? Object.values(details).flat().join(" ") : undefined;

    const message =
      detailsMessage ||
      (typeof data?.message === "string" ? data.message : undefined) ||
      (typeof data?.title === "string" ? data.title : undefined) ||
      err.message;

    return { message, status: err.response?.status, details };
  }

  if (err instanceof Error) {
    return { message: err.message };
  }

  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return { message: e.message };
    if (Array.isArray(e.errors) && typeof e.errors[0]?.message === "string")
      return { message: e.errors[0].message };
  }

  if (typeof err === "string") return { message: err };

  return { message: "Ocurrió un error inesperado" };
}

/**
 * Convenience function that returns only the error message string.
 * Prefer `extractErrorMetadata` when you also need the HTTP status or details.
 */
export function getApiErrorMessage(err: unknown): string {
  return extractErrorMetadata(err).message;
}
