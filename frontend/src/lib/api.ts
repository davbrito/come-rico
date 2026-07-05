import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import type { Config, CreateClientConfig } from "#/api/client";

const getConfig = createIsomorphicFn()
  .client(
    (): Config => ({
      baseUrl: window.location.origin,
    }),
  )
  .server(
    (): Config => ({
      baseUrl: process.env.BACKEND_URL ?? "http://localhost:5276",
      headers: {
        cookie: getRequestHeader("cookie"),
      },
    }),
  );

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  credentials: "same-origin",
  ...getConfig(),
});

export function getApiErrorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    if (Array.isArray(e.errors) && typeof e.errors[0]?.message === "string")
      return e.errors[0].message;
  }
  if (typeof err === "string") return err;
  return "Ocurrió un error inesperado";
}
