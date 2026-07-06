import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import axios, { isAxiosError, type InternalAxiosRequestConfig } from "axios";

import type { CreateClientConfig } from "#/api/client";

const getBaseUrl = createIsomorphicFn()
  .server(() => process.env.BACKEND_URL ?? "http://localhost:5276")
  .client(() => window.location.origin);

const initRequest = createIsomorphicFn()
  .server(async (config: InternalAxiosRequestConfig) => {
    const cookie = getRequestHeader("cookie");
    if (cookie) {
      config.headers["cookie"] = cookie;
    }
    return config;
  })
  .client((config) => config);

axios.defaults.adapter = "fetch";
axios.defaults.baseURL = getBaseUrl();
axios.interceptors.request.use(initRequest);

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

    const detailsMessage = details
      ? Object.values(details).flat().join(" ")
      : undefined;

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
