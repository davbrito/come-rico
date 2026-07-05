import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { BeforeRequestState } from "ky";

import type { CreateClientConfig } from "#/api/client";

const DUMMY_BASE_URL = "https://localhost.dummy";

const initRequest = createIsomorphicFn()
  .server(({ request }: BeforeRequestState): Request => {
    const baseUrl = process.env.BACKEND_URL ?? "http://localhost:5276";
    const newRequest = new Request(request.url.replace(DUMMY_BASE_URL, baseUrl));
    const cookie = getRequestHeader("cookie");
    if (cookie) {
      newRequest.headers.set("cookie", cookie);
    }
    return newRequest;
  })
  .client(({ request }) => {
    return new Request(request.url.replace(DUMMY_BASE_URL, window.location.origin));
  });

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  // This avoids hydration errors when using SSR, since the baseUrl is set in the initRequest hook
  baseUrl: DUMMY_BASE_URL,
  credentials: "same-origin",
  kyOptions: {
    hooks: { beforeRequest: [initRequest] },
  },
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
