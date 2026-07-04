// ─── Domain Types ──────────────────────────────────────────────────────────────

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

const getHouseholdId = (): string => {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('householdId') ?? ''
}

const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const householdId = getHouseholdId()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(householdId ? { 'X-Household-Id': householdId } : {}),
    ...(init?.headers ?? {}),
  }

  const res = await fetch(`/api${path}`, { ...init, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(body.message ?? `API error ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ─── Households ────────────────────────────────────────────────────────────────

export const householdsApi = {
  create: (name: string) =>
    apiFetch<Household>('/households', {
      method: 'POST',
      body: JSON.stringify({ name }),
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
