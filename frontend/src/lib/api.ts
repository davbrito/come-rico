import type { CreateClientConfig } from "#/api/client.gen";
import { createIsomorphicFn } from "@tanstack/react-start";

const getBaseUrl = createIsomorphicFn()
  .client(() => undefined)
  .server(() => process.env.BACKEND_URL ?? "http://localhost:5000");

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: getBaseUrl(),
  credentials: 'same-origin',
});

export function getApiErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>
    if (typeof e.message === 'string') return e.message
    if (Array.isArray(e.errors) && typeof e.errors[0]?.message === 'string')
      return e.errors[0].message
  }
  if (typeof err === 'string') return err
  return 'Ocurrió un error inesperado'
}
