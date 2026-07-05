import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import axios, { type InternalAxiosRequestConfig } from "axios";

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
