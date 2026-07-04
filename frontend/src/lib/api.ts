// ─── Domain Types ──────────────────────────────────────────────────────────────

export interface CurrentUser {
  id: string
  displayName: string
  email: string
  householdId: string | null
  householdName: string | null
  inviteCode: string | null
  role: 'Admin' | 'Member'
}

export interface Household {
  id: string
  name: string
  inviteCode: string
  createdAt: string
}

export interface Dish {
  id: string
  householdId: string
  name: string
  description: string | null
  imageUrl: string | null
  isActive: boolean
  createdAt: string
}

export interface SpinRouletteResult {
  sessionId: string
  householdId: string
  winnerDishId: string
  winnerDishName: string
  spunAt: string
}

export interface RouletteSession {
  id: string
  householdId: string
  status: 'Pending' | 'Spinning' | 'Completed' | 'Cancelled'
  winnerDishId: string | null
  winnerDishName: string | null
  createdAt: string
  spunAt: string | null
}

// ─── API Client ────────────────────────────────────────────────────────────────
//
// BFF pattern: every call goes to the same origin (`/api/*`, proxied to the .NET
// backend). Auth lives in an HttpOnly cookie set by the backend — the browser
// sends it automatically and no token is ever readable from JavaScript.

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>)
    const message =
      (body as { message?: string }).message ??
      (body as { errors?: Array<{ message: string }> }).errors?.[0]?.message ??
      `API error ${res.status}`
    throw new ApiError(message, res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: { displayName: string; email: string; password: string }) =>
    apiFetch<CurrentUser>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  login: (data: { email: string; password: string }) =>
    apiFetch<CurrentUser>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),

  me: async (): Promise<CurrentUser | null> => {
    try {
      return await apiFetch<CurrentUser>('/auth/me')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null
      throw e
    }
  },
}

// ─── Households ────────────────────────────────────────────────────────────────

export const householdsApi = {
  create: (name: string) =>
    apiFetch<Household>('/households', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  join: (inviteCode: string) =>
    apiFetch<Household>('/households/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    }),
}

// ─── Dishes ────────────────────────────────────────────────────────────────────

export const dishesApi = {
  getAll: () => apiFetch<Dish[]>('/dishes'),

  create: (data: { name: string; description?: string; imageUrl?: string }) =>
    apiFetch<Dish>('/dishes', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: { name: string; description?: string; imageUrl?: string }) =>
    apiFetch<Dish>(`/dishes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  remove: (id: string) => apiFetch<void>(`/dishes/${id}`, { method: 'DELETE' }),
}

// ─── Roulette ──────────────────────────────────────────────────────────────────

export const rouletteApi = {
  spin: () => apiFetch<SpinRouletteResult>('/roulette/spin', { method: 'POST' }),

  getHistory: (page = 1, pageSize = 20) =>
    apiFetch<RouletteSession[]>(`/roulette/history?page=${page}&pageSize=${pageSize}`),
}
