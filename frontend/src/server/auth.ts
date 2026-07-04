import { createServerFn } from '@tanstack/react-start'
import {
  getRequestHeader,
  getRequestHost,
  getRequestProtocol,
} from '@tanstack/react-start/server'
import type { CurrentUser } from '#/lib/api'

/**
 * Reads the current session on the Start server (the BFF): forwards the
 * incoming auth cookie to the .NET backend and returns the user, or null.
 *
 * Because this runs in `beforeLoad`, both SSR and client-side navigations
 * see the same auth state — the session never "disappears" on reload.
 */
export const fetchCurrentUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CurrentUser | null> => {
    const cookie = getRequestHeader('cookie')
    if (!cookie) return null

    // In dev BACKEND_URL points at the .NET API; in production the same-origin
    // /api path is rewritten to the backend service by vercel.json.
    const base =
      process.env.BACKEND_URL ?? `${getRequestProtocol()}://${getRequestHost()}`

    try {
      const res = await fetch(`${base}/api/auth/me`, { headers: { cookie } })
      if (!res.ok) return null
      return (await res.json()) as CurrentUser
    } catch {
      return null
    }
  },
)
