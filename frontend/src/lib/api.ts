import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import type { ClientOptions, Config } from "#/api/client";
import type { CreateClientConfig } from "#/api/client.gen";

const getConfig = createIsomorphicFn()
  .client((): Config<ClientOptions> => ({}))
  .server((): Config<ClientOptions> => {
    const cookie = getRequestHeader("cookie");
    return {
      baseUrl: process.env.BACKEND_URL ?? "http://localhost:5276",

      headers: {
        cookie: cookie,
      },
    };
  });

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
